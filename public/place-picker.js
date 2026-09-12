import { loadBaiduMap } from './baidu-map.js';
import { esc, icon } from './ui.js';
import { validPoint } from './map-geo.js';
import { locationAccessMessage } from './location-access.js';

const bounded = (work, message, ms = 12000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
export async function mountPlacePreview(form, config) {
  form.querySelector('.pub-mini-map')?.remove();
  if (form.classList.contains('pub-simple')) return;
  const value = form.elements.place.value;
  if (!value || config?.provider !== 'baidu') return;
  const place = JSON.parse(value),
    host = document.createElement('div');
  host.className = 'pub-mini-map';
  host.setAttribute('aria-label', '已选服务地点地图');
  form.querySelector('.pub-place-button').after(host);
  try {
    const B = await loadBaiduMap(config.browserAk);
    if (!host.isConnected) return;
    const map = new B.Map(host, { enableMapClick: false, enableIconClick: false });
    const point = new B.Point(place.lng, place.lat);
    map.centerAndZoom(point, 16);
    map.disableDragging();
    map.disableScrollWheelZoom();
    map.addOverlay(new B.Marker(point));
    map.addControl(new B.ScaleControl({ anchor: 2 }));
  } catch {
    if (host.isConnected) host.textContent = '地图预览暂不可用，已保留所选地点';
  }
}
export async function choosePlace({ config, place, region, query = '', onChoose }) {
  document.querySelector('#place-picker')?.close();
  let returnFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'place-picker';
  dialog.className = 'place-picker';
  dialog.setAttribute('aria-labelledby', 'place-picker-title');
  dialog.innerHTML = `<header class="place-head"><div><h2 id="place-picker-title">选择服务地点</h2><p>搜索地点或移动地图，核对后确认</p></div><button type="button" data-pick="close" aria-label="关闭选址">${icon('close')}</button></header>
    <form class="place-search"><label>搜索范围<input name="city" aria-label="搜索范围" value="${esc(place?.city || region || '')}" placeholder="城市或区县"></label><div><input name="query" aria-label="搜索服务地点" value="${esc(query)}" placeholder="搜索社区、医院、街道" maxlength="150"><button type="submit">搜索</button></div></form>
    <div class="place-tools"><button type="button" data-pick="locate">${icon('locate')}当前位置</button><button type="button" data-pick="retry">重新加载地图</button><button type="button" data-pick="manual">手动填写地址</button></div>
    <p class="place-status" role="status">正在加载地图…</p><div class="place-results" aria-label="搜索结果"></div>
    <div class="place-map-wrap"><div class="place-map" aria-label="可拖动的服务地点地图"></div><span class="place-crosshair" aria-hidden="true">${icon('pin')}</span></div>
    <footer class="place-footer"><div class="place-selected"><strong>请先选择服务地点</strong><p>选择后会自动填入地址与所在区域</p></div><button class="primary wide" type="button" data-pick="confirm" disabled>确认使用此地点</button></footer>`;
  document.body.append(dialog);
  dialog.showModal();
  let B,
    map,
    selected = null,
    alive = true,
    generation = 0,
    searchGeneration = 0,
    resize,
    marker,
    scale;
  const status = dialog.querySelector('.place-status'),
    confirm = dialog.querySelector('[data-pick=confirm]');
  const say = (text) => {
    if (alive) status.textContent = text;
  };
  function showSelection(value) {
    selected = value;
    confirm.disabled = !value;
    dialog.querySelector('.place-selected strong').textContent = value?.name || '请先选择服务地点';
    dialog.querySelector('.place-selected p').textContent =
      value?.address || '选择后会自动填入地址与所在区域';
    if (value && map) {
      if (marker) map.removeOverlay?.(marker);
      marker = new B.Marker(new B.Point(value.lng, value.lat));
      map.addOverlay(marker);
      dialog.querySelector('.place-crosshair').hidden = true;
    } else if (map) {
      if (marker) map.removeOverlay?.(marker);
      marker = null;
      dialog.querySelector('.place-crosshair').hidden = false;
    }
  }
  const reverse = (point) =>
    bounded((resolve) => new B.Geocoder().getLocation(point, resolve), '地址查询超时，请重新选点');
  async function selectPoint(point, candidate) {
    const token = ++generation;
    showSelection(null);
    say('正在核对地址…');
    try {
      const result = await reverse(point);
      if (!alive || token !== generation) return;
      const c = result?.addressComponents;
      if (!result?.address || !c) throw new Error('未找到此处的文字地址，请移动地图或搜索附近地点');
      showSelection({
        name: candidate?.title || result.surroundingPois?.[0]?.title || result.address,
        address: candidate?.address || result.address,
        city: c.city || c.province || '',
        district: c.district || '',
        lng: point.lng,
        lat: point.lat,
        coordinateSystem: 'bd09',
      });
      say('请核对地图标记和文字地址，确认这是本次服务地点');
    } catch (e) {
      if (alive && token === generation) say(e.message);
    }
  }
  async function search() {
    if (!map) return say('地图尚未就绪，可重新加载或手动填写地址');
    const q = dialog.querySelector('[name=query]').value.trim();
    if (!q) return say('请输入地点名称');
    const token = ++searchGeneration;
    say('正在搜索…');
    try {
      const rows = await bounded((resolve) => {
        const local = new B.LocalSearch(dialog.querySelector('[name=city]').value.trim() || map, {
          pageCapacity: 8,
          onSearchComplete: (result) => {
            const list = [];
            if (local.getStatus() === 0 && result)
              for (let i = 0; i < Math.min(result.getCurrentNumPois(), 8); i++) {
                const p = result.getPoi(i);
                if (validPoint(p?.point)) list.push(p);
              }
            resolve(list);
          },
        });
        local.search(q);
      }, '搜索超时，请重试');
      if (!alive || token !== searchGeneration) return;
      const list = dialog.querySelector('.place-results');
      list.replaceChildren();
      for (const p of rows) {
        const button = document.createElement('button');
        button.type = 'button';
        const title = document.createElement('strong'),
          address = document.createElement('span');
        title.textContent = p.title;
        address.textContent = p.address;
        button.append(title, address);
        button.addEventListener('click', () => {
          list.replaceChildren();
          map.checkResize?.();
          map.centerAndZoom(p.point, 17);
          void selectPoint(p.point, p);
        });
        list.append(button);
      }
      say(
        rows.length
          ? `找到 ${rows.length} 个地点，请选择`
          : '没有找到匹配地点，可修改范围或关键词，也可在地图上选点',
      );
    } catch (e) {
      if (token === searchGeneration) say(e.message);
    }
  }
  async function initialize() {
    if (map) {
      map.checkResize?.();
      return say('地图已就绪，可搜索或移动地图选点');
    }
    if (config?.provider !== 'baidu' || !config.browserAk)
      return say('地图暂不可用，仍可手动填写地址；恢复后可继续选址');
    say('正在加载地图…');
    try {
      B = await loadBaiduMap(config.browserAk);
      if (!alive || map) return;
      map = new B.Map(dialog.querySelector('.place-map'), { enableMapClick: false, enableIconClick: false });
      map.centerAndZoom(new B.Point(place?.lng || 120.1551, place?.lat || 30.2741), place ? 17 : 12);
      map.enableScrollWheelZoom(true);
      scale = new B.ScaleControl({ anchor: 2 });
      map.addControl(scale);
      resize = new ResizeObserver(() => map.checkResize?.());
      resize.observe(dialog.querySelector('.place-map'));
      map.addEventListener('dragend', () => void selectPoint(map.getCenter()));
      map.addEventListener('dragstart', () => {
        generation++;
        showSelection(null);
        if (marker) map.removeOverlay?.(marker);
        marker = null;
        dialog.querySelector('.place-crosshair').hidden = false;
      });
      map.addEventListener('zoomend', () => {
        map.removeControl?.(scale);
        scale = new B.ScaleControl({ anchor: 2 });
        map.addControl(scale);
        if (!selected) say('移动地图或点击位置完成选点');
      });
      map.addEventListener('click', (e) => {
        if (validPoint(e.point)) {
          map.panTo(e.point);
          void selectPoint(e.point);
        }
      });
      say('地图已就绪，可搜索或移动地图选点');
      if (place) showSelection(place);
      else if (region) {
        const token = generation;
        const p = await bounded(
          (resolve) => new B.Geocoder().getPoint(region, resolve, region),
          '地区加载超时',
        );
        if (alive && token === generation && validPoint(p)) map.centerAndZoom(p, 13);
      }
      if (query && alive) await search();
    } catch (e) {
      say(e.message + '；也可手动填写地址');
    }
  }
  dialog.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void search();
  });
  dialog.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || b.disabled) return;
    const action = b.dataset.pick;
    if (action === 'close' || action === 'manual') {
      if (action === 'manual') returnFocus = document.querySelector('#publish-form [name=address]');
      dialog.close();
      return;
    }
    if (action === 'confirm' && selected) {
      onChoose(selected);
      dialog.close();
      return;
    }
    b.disabled = true;
    try {
      if (action === 'retry') await initialize();
      if (action === 'locate') {
        const unavailable = locationAccessMessage();
        if (unavailable) throw new Error(unavailable);
        if (!map) throw new Error('地图尚未就绪，可搜索地址或手动填写');
        if (!navigator.geolocation) throw new Error('浏览器不支持定位，请搜索服务地点');
        const token = ++generation;
        showSelection(null);
        say('定位中，请允许浏览器获取位置…');
        const coords = await bounded(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              (p) => resolve(p.coords),
              (e) =>
                reject(
                  new Error(
                    e.code === 1 ? '定位权限未开启，请搜索地点或在地图上选点' : '定位失败，请重试或搜索地点',
                  ),
                ),
              { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
            ),
          '定位超时，请搜索地点',
          15000,
        );
        const result = await bounded(
          (resolve) =>
            new B.Convertor().translate([new B.Point(coords.longitude, coords.latitude)], 1, 5, resolve),
          '位置转换超时，请重试',
        );
        if (!alive || token !== generation) return;
        if (result?.status !== 0 || !validPoint(result.points?.[0]))
          throw new Error('位置转换失败，请搜索服务地点');
        map.centerAndZoom(result.points[0], 17);
        await selectPoint(result.points[0]);
      }
    } catch (e) {
      say(e.message);
    } finally {
      b.disabled = false;
    }
  });
  dialog.addEventListener(
    'close',
    () => {
      alive = false;
      generation++;
      searchGeneration++;
      resize?.disconnect();
      dialog.remove();
      if (returnFocus?.isConnected) {
        returnFocus.closest('details')?.setAttribute('open', '');
        returnFocus.focus();
      }
    },
    { once: true },
  );
  await initialize();
}
