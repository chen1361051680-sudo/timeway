import { loadBaiduMap } from './baidu-map.js';
import { esc, icon } from './ui.js';
import { validPoint } from './map-geo.js';
import { locationAccessMessage } from './location-access.js';

const durationText = seconds => {
  const minutes = Math.ceil(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}` : `${minutes} 分钟`;
};
const distanceText = meters => meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`;
const durationMarkup = seconds => {
  const minutes = Math.ceil(seconds / 60);
  return minutes >= 60
    ? `<strong>${Math.floor(minutes / 60)}</strong><span>小时</span>${minutes % 60 ? `<strong>${minutes % 60}</strong><span>分钟</span>` : ''}`
    : `<strong>${minutes}</strong><span>分钟</span>`;
};
const metric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function transitInfo(plan) {
  const lines = Array.from({ length: plan.getNumLines?.() || 0 }, (_, i) => plan.getLine(i));
  const walks = Array.from({ length: plan.getNumRoutes?.() || 0 }, (_, i) => plan.getRoute(i).getDistance?.(false));
  return { lines, walking: walks.every(metric) ? walks.reduce((a, b) => a + b, 0) : null };
}

export function openTaskRoute(task, config) {
  document.querySelector('#task-route')?.close();
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'task-route';
  dialog.className = 'task-route';
  dialog.setAttribute('aria-labelledby', 'route-title');
  dialog.innerHTML = `<header class="route-head"><h2 id="route-title">前往服务地点</h2><button type="button" data-route="close" aria-label="关闭路线">${icon('close')}</button></header>
    <div class="route-body"><form class="route-origin"><label><span>起点</span><input name="origin" aria-label="出发地" placeholder="我的位置，或输入出发地址" maxlength="200"></label><button type="button" data-route="locate" aria-label="使用当前位置">${icon('locate')}</button><button type="submit">查路线</button></form>
    <div class="route-destination"><span>终点</span><strong>${esc(task.address || task.place?.address || task.region)}</strong></div>
    <div class="route-modes" role="tablist" aria-label="出行方式">${[['walking', '步行'], ['transit', '公交'], ['driving', '驾车']].map(([mode, label]) => `<button type="button" role="tab" aria-selected="${mode === 'walking'}" data-mode="${mode}">${label}</button>`).join('')}</div>
    <p class="route-status" role="status">正在加载地图并获取当前位置…</p>
    <div class="route-map" aria-label="前往服务地点的路线地图"></div>
    <section class="route-plans" aria-label="公交换乘方案" hidden><h3></h3><div class="route-plan-list"></div></section>
    <div class="route-result" hidden><div class="route-metrics"><strong class="route-duration"></strong><span class="route-distance"></span><span class="route-arrival"></span></div><div class="route-steps"></div><p class="route-description"></p><small>按现在出发预计，实际耗时以交通状况为准</small></div></div>
    <footer class="route-footer"><a class="primary wide" target="_blank" rel="noopener noreferrer">打开百度地图导航 ${icon('arrow')}</a></footer>`;
  document.body.append(dialog);
  dialog.showModal();
  const status = dialog.querySelector('.route-status');
  const input = dialog.querySelector('[name=origin]');
  const resultBox = dialog.querySelector('.route-result');
  const navigation = dialog.querySelector('.route-footer a');
  const plansBox = dialog.querySelector('.route-plans');
  let plans = [];
  let alive = true, generation = 0, mode = 'walking', B, map, origin, destination, observer;
  const pending = new Set();
  const bounded = (work, message, ms = 15000) => new Promise((resolve, reject) => {
    const finish = (fn, value) => { clearTimeout(timer); pending.delete(cancel); fn(value); };
    const cancel = () => finish(reject, new Error('路线已关闭'));
    const timer = setTimeout(() => finish(reject, new Error(message)), ms);
    pending.add(cancel);
    try { work(value => finish(resolve, value), error => finish(reject, error)); }
    catch (error) { finish(reject, error); }
  });
  const say = text => { if (alive) status.textContent = text; };
  function updateNavigation() {
    const url = new URL('https://api.map.baidu.com/direction');
    url.search = new URLSearchParams({
      origin: origin ? `latlng:${origin.lat},${origin.lng}|name:${input.value || '我的位置'}` : input.value || '我的位置',
      destination: destination ? `latlng:${destination.lat},${destination.lng}|name:${task.address || task.title}` : task.address || task.region,
      mode, region: task.place?.city || task.region, coord_type: 'bd09ll', output: 'html', src: 'webapp.timeway.route',
    });
    navigation.href = url.href;
    navigation.textContent = mode === 'transit' ? '打开百度地图查看公交' : '打开百度地图导航';
  }
  function reset() {
    resultBox.hidden = true;
    plans = [];
    plansBox.hidden = true;
    plansBox.querySelector('.route-plan-list').replaceChildren();
    dialog.classList.remove('has-transit-plans');
    map?.clearOverlays();
    if (destination && map) map.addOverlay(new B.Marker(destination));
    updateNavigation();
  }
  async function convert(point) {
    const data = await bounded(resolve => new B.Convertor().translate([new B.Point(point.lng, point.lat)], 1, 5, resolve), '坐标转换超时，请重试');
    if (data?.status !== 0 || !validPoint(data.points?.[0])) throw new Error('坐标转换失败，请重试');
    return data.points[0];
  }
  async function geocode(address) {
    const point = await bounded(resolve => new B.Geocoder().getPoint(address, resolve, task.place?.city || task.region), '地址查询超时，请重试');
    if (!validPoint(point)) throw new Error('未找到该地址，请补充城市和街道后重试');
    return point;
  }
  const ready = (async () => {
    if (config?.provider !== 'baidu' || !config.browserAk) throw new Error('地图暂不可用，可打开百度地图查看路线');
    B = await loadBaiduMap(config.browserAk);
    if (!alive) return;
    map = new B.Map(dialog.querySelector('.route-map'), { enableMapClick: false, enableIconClick: false });
    map.centerAndZoom(new B.Point(120.1551, 30.2741), 13);
    map.enableScrollWheelZoom(true);
    map.addControl(new B.ScaleControl({ anchor: 2 }));
    observer = new ResizeObserver(() => map.checkResize?.());
    observer.observe(dialog.querySelector('.route-map'));
    if (task.place?.coordinateSystem === 'bd09' && validPoint(task.place))
      destination = new B.Point(task.place.lng, task.place.lat);
    else if (Number.isFinite(task.lat) && Number.isFinite(task.lng)) destination = await convert(task);
    else destination = await geocode(task.address || task.region);
    if (!alive) return;
    map.centerAndZoom(destination, 15);
    reset();
  })();
  async function search(token) {
    if (!alive || token !== generation || !origin || !destination) return;
    reset();
    say('正在规划路线…');
    const type = { walking: B.WalkingRoute, transit: B.TransitRoute, driving: B.DrivingRoute }[mode];
    if (!type) throw new Error('当前地图不支持此出行方式，请打开百度地图导航');
    let planner;
    const result = await bounded(resolve => {
      // Render only the current response; a slow previous mode must not replace it.
      planner = new type(map, { onSearchComplete: resolve });
      planner.search(origin, destination);
    }, '路线查询超时，请重试或打开百度地图导航');
    if (!alive || token !== generation) return;
    if (planner.getStatus() !== 0 || !result?.getNumPlans()) throw new Error('未找到可用路线，请切换出行方式或打开百度地图');
    const count = mode === 'transit' ? result.getNumPlans() : 1;
    plans = Array.from({ length: count }, (_, i) => result.getPlan(i))
      .filter(plan => metric(plan.getDuration(false)) && metric(plan.getDistance(false)));
    if (!plans.length) throw new Error('暂时无法获取路线耗时，请打开百度地图查看');
    if (mode === 'transit') {
      plansBox.hidden = false;
      dialog.classList.add('has-transit-plans');
      map.checkResize?.();
      plansBox.querySelector('h3').textContent = plans.length > 1 ? `百度地图提供 ${plans.length} 套方案` : '百度地图当前提供 1 套方案';
      plansBox.querySelector('.route-plan-list').innerHTML = plans.map((plan, i) => {
        const { lines, walking } = transitInfo(plan);
        const transfers = lines.length > 1 ? `换乘 ${lines.length - 1} 次` : lines.length ? '无需换乘' : '全程步行';
        const lineNames = lines.map(line => line.title).filter(Boolean);
        return `<button type="button" class="route-plan" data-plan="${i}" aria-pressed="false"><span class="route-plan-top"><span class="route-plan-number">方案 ${String(i + 1).padStart(2, '0')}</span><span class="route-plan-choice" aria-hidden="true">${icon('check')}</span></span><span class="route-plan-heading"><span class="route-plan-time">${durationMarkup(plan.getDuration(false))}</span><span class="route-plan-distance">全程 ${distanceText(plan.getDistance(false))}</span></span><span class="route-plan-lines">${lineNames.length ? lineNames.map((name, n) => `${n ? '<span class="route-line-arrow" aria-hidden="true">→</span>' : ''}<span class="route-line">${n === 0 ? icon('bus') : ''}<span>${esc(name)}</span></span>`).join('') : `<span class="route-line">${icon('pin')}<span>步行到达</span></span>`}</span><span class="route-plan-meta"><span class="route-transfer${lines.length === 1 ? ' direct' : ''}">${esc(transfers)}</span>${walking !== null ? `<span class="route-meta-divider" aria-hidden="true"> · </span><span>步行 ${distanceText(walking)}</span>` : ''}</span></button>`;
      }).join('');
    }
    showPlan(0);
  }
  function showPlan(index) {
    const plan = plans[index];
    if (!alive || !plan) return;
    plansBox.querySelectorAll('[data-plan]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.plan) === index)));
    const seconds = Number(plan.getDuration(false)), meters = Number(plan.getDistance(false));
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(meters) || meters < 0)
      throw new Error('暂时无法获取路线耗时，请打开百度地图查看');
    map.clearOverlays();
    const points = [origin, destination];
    for (const [count, get] of [['getNumRoutes', 'getRoute'], ['getNumLines', 'getLine']]) {
      for (let i = 0; i < (plan[count]?.() || 0); i++) {
        const path = plan[get](i).getPath?.() || [];
        if (!path.length) continue;
        points.push(...path);
        const walk = mode === 'transit' && get === 'getRoute';
        map.addOverlay(new B.Polyline(path, { strokeColor: walk ? '#839ab3' : '#4b8bff', strokeStyle: walk ? 'dashed' : 'solid', strokeWeight: walk ? 4 : 6, strokeOpacity: 0.85 }));
      }
    }
    for (const [point, label] of [[origin, '出发地'], [destination, '服务地点']]) {
      const marker = new B.Marker(point); marker.setTitle(label); map.addOverlay(marker);
    }
    map.setViewport(points, { margins: [35, 25, 45, 25] });
    dialog.querySelector('.route-duration').textContent = `约 ${durationText(seconds)}`;
    dialog.querySelector('.route-distance').textContent = distanceText(meters);
    const arrival = new Date(Date.now() + seconds * 1000);
    const day = arrival.toDateString() === new Date().toDateString() ? '' : `${arrival.getMonth() + 1}/${arrival.getDate()} `;
    dialog.querySelector('.route-arrival').textContent = `预计 ${day}${arrival.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 到达`;
    const steps = dialog.querySelector('.route-steps');
    steps.replaceChildren();
    if (mode === 'transit') {
      const { lines } = transitInfo(plan);
      steps.innerHTML = `<h3>方案 ${index + 1} · 乘车步骤</h3>${lines.length ? `<ol>${lines.map(line => {
        const on = line.getGetOnStop?.()?.title, off = line.getGetOffStop?.()?.title;
        const stops = line.getNumViaStops?.();
        return `<li><strong>${esc(line.title || '公共交通')}</strong><span>${esc(on ? `${on} 上车` : '上车站以地图为准')} → ${esc(off ? `${off} 下车` : '下车站以地图为准')}</span>${metric(stops) ? `<small>途经 ${stops} 站</small>` : ''}</li>`;
      }).join('')}</ol>` : '<p>本方案无需乘车，按地图步行到达。</p>'}`;
    }
    dialog.querySelector('.route-description').textContent = mode === 'transit' ? plan.getDescription?.(false) || '' : '';
    resultBox.hidden = false;
    say(mode === 'transit' ? `已选择方案 ${index + 1}，地图已同步` : '路线已更新');
    updateNavigation();
  }
  async function run(locate = false) {
    const token = ++generation;
    if (locate) { origin = null; input.value = ''; }
    reset();
    say(locate ? '正在获取当前位置…' : '正在查询路线…');
    try {
      await ready;
      if (!alive || token !== generation) return;
      if (locate) {
        const reason = locationAccessMessage();
        if (reason) throw new Error(reason);
        if (!navigator.geolocation) throw new Error('浏览器不支持定位，请输入出发地址');
        const gps = await bounded((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve,
          error => reject(new Error(error.code === 1 ? '未获定位权限，请输入出发地址，或允许定位后重试' : '定位失败，请输入出发地址或重试')),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }), '定位超时，请输入出发地址');
        const point = await convert({ lng: gps.coords.longitude, lat: gps.coords.latitude });
        if (!alive || token !== generation) return;
        origin = point; input.value = '我的位置';
      } else if (!origin) {
        if (!input.value.trim() || input.value.trim() === '我的位置') throw new Error('请输入出发地址，或点击定位按钮');
        const point = await geocode(input.value.trim());
        if (!alive || token !== generation) return;
        origin = point;
      }
      await search(token);
    } catch (error) {
      if (alive && token === generation) { resultBox.hidden = true; say(error.message); updateNavigation(); }
    }
  }
  input.addEventListener('input', () => { ++generation; origin = null; reset(); say('点击“查路线”更新出发地'); });
  dialog.querySelector('form').addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); void run(); });
  dialog.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.route === 'close') dialog.close();
    if (button.dataset.route === 'locate') void run(true);
    if (button.dataset.plan !== undefined) showPlan(Number(button.dataset.plan));
    if (button.dataset.mode) {
      mode = button.dataset.mode;
      dialog.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-selected', String(el.dataset.mode === mode)));
      void run();
    }
  });
  const close = () => dialog.close();
  window.addEventListener('hashchange', close);
  dialog.addEventListener('close', () => {
    alive = false; ++generation;
    for (const cancel of pending) cancel();
    observer?.disconnect(); map?.clearOverlays();
    window.removeEventListener('hashchange', close);
    dialog.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }, { once: true });
  updateNavigation();
  void run(true);
}
