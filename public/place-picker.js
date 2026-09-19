import { loadBaiduMap } from './baidu-map.js';
import { esc, icon } from './ui.js';
import { validPoint } from './map-geo.js';
import { currentLocation } from './current-location.js';

const recentSelections = new Map();
const cityName = region => String(region || '').replace(/^.*?(?:省|自治区)/, '').match(/^.*?市/)?.[0] || String(region || '').trim();
const addressLine = value => [...new Set([value.province, value.city, value.district])]
  .filter(part => part && !value.address?.includes(part)).concat(value.address || '').join(' · ');
const bounded = (work, message, ms = 12000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), ms);
  work(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

export async function mountPlacePreview(form, config) {
  form.querySelector('.pub-mini-map')?.remove();
  if (form.classList.contains('pub-simple')) return;
  const value = form.elements.place.value;
  if (!value || config?.provider !== 'baidu') return;
  const place = JSON.parse(value), host = document.createElement('div');
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

export async function choosePlace({ config, place, region, query = '', user = {}, loadRecent, onChoose }) {
  document.querySelector('#place-picker')?.close();
  let returnFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'place-picker';
  dialog.className = 'place-picker';
  dialog.dataset.stage = 'search';
  dialog.setAttribute('aria-labelledby', 'place-picker-title');
  let city = cityName(place?.city || region || user.region);
  dialog.innerHTML = `<header class="place-head"><div><h2 id="place-picker-title">选择服务地点</h2><p>找到地点，核对后确认</p></div><button type="button" data-pick="close" aria-label="关闭选址">${icon('close')}</button></header>
    <form class="place-search" role="search"><div class="place-search-bar"><button type="button" data-pick="city" aria-label="切换搜索城市" aria-expanded="false"><span>${esc(city || '选择城市')}</span>${icon('chevron-down')}</button><input name="query" aria-label="搜索服务地点" value="${esc(query)}" placeholder="社区、医院或地址" maxlength="150" autocomplete="off" enterkeyhint="search"><button type="button" data-pick="clear" aria-label="清空搜索" hidden>${icon('close')}</button><button type="submit" aria-label="搜索地点">${icon('search')}</button></div></form>
    <form class="place-city-editor" hidden><label for="place-city">搜索城市或区县</label><div><input id="place-city" name="city" value="${esc(city)}" placeholder="例如：长沙市" maxlength="80" required><button type="submit">应用</button></div></form>
    <div class="place-tools"><button type="button" data-pick="locate">${icon('locate')}使用当前位置</button><button type="button" data-pick="map">${icon('pin')}地图选点</button><button type="button" data-pick="search-mode" hidden>${icon('search')}重新搜索</button></div>
    <div class="place-body"><p class="place-status" role="status" hidden></p><div class="place-recovery" hidden><button type="button" data-pick="retry" hidden>重新加载地图</button><button type="button" data-pick="manual">手动填写地址</button></div>
    <section class="place-suggestions" aria-label="常用地点"><div class="place-org" ${user.address ? '' : 'hidden'}><h3>机构地址</h3><button type="button" data-pick="org">${icon('building')}<span><strong>${esc(user.name || '机构地址')}</strong><small>${esc(user.address)}</small></span>${icon('arrow')}</button></div><div class="place-recent" hidden><h3>最近使用</h3><div class="place-recent-list"></div></div><p class="place-search-hint">${icon('search')}输入地点名称，选择对应地址</p></section>
    <div class="place-results" aria-label="搜索结果" hidden></div>
    <div class="place-map-wrap" hidden><div class="place-map" aria-label="可拖动的服务地点地图"></div><span class="place-crosshair" aria-hidden="true">${icon('pin')}</span><span class="place-map-hint">拖动地图可调整位置</span></div></div>
    <footer class="place-footer" hidden><div class="place-selected"><strong>请选择地图上的服务地点</strong><p>核对地址后确认</p></div><button class="primary wide" type="button" data-pick="confirm" disabled>确认地点</button></footer>`;
  document.body.append(dialog);
  dialog.showModal();
  const find = selector => dialog.querySelector(selector);
  const input = find('[name=query]'), status = find('.place-status'), confirm = find('[data-pick=confirm]');
  let B, map, marker, resize, selected = null, alive = true, generation = 0, searchGeneration = 0, timer, composing = false, initializing;
  const searches = new Map();
  const say = (text = '', recover = false, retry = false) => {
    if (!alive) return;
    status.textContent = text;
    status.hidden = !text;
    find('.place-recovery').hidden = !recover;
    find('[data-pick=retry]').hidden = !retry;
  };
  const setCity = value => {
    city = value.trim();
    find('[data-pick=city] span').textContent = city || '选择城市';
    find('[name=city]').value = city;
  };
  const stage = value => {
    dialog.dataset.stage = value;
    const searching = value === 'search';
    find('.place-map-wrap').hidden = searching;
    find('.place-footer').hidden = searching;
    find('.place-suggestions').hidden = !searching || !!input.value.trim();
    find('.place-results').hidden = !searching || !input.value.trim();
    find('[data-pick=map]').hidden = !searching;
    find('[data-pick=search-mode]').hidden = searching;
    find('.place-body').scrollTop = 0;
    if (!searching) {
      input.blur();
      find('.place-city-editor').hidden = true;
      find('[data-pick=city]').setAttribute('aria-expanded', 'false');
      map?.checkResize();
    }
  };
  function showSelection(value) {
    selected = value;
    confirm.disabled = !value;
    find('.place-selected strong').textContent = value?.name || '请选择地图上的服务地点';
    find('.place-selected p').textContent = value ? addressLine(value) : '核对地址后确认';
    if (marker) map.removeOverlay(marker);
    marker = null;
    find('.place-crosshair').hidden = !!value;
    if (value && map) {
      marker = new B.Marker(new B.Point(value.lng, value.lat));
      map.addOverlay(marker);
    }
  }
  function invalidate() {
    generation++;
    searchGeneration++;
    clearTimeout(timer);
    showSelection(null);
  }
  async function selectPoint(point, candidate) {
    const token = ++generation;
    searchGeneration++;
    clearTimeout(timer);
    stage('map');
    showSelection(null);
    say('正在核对地址…');
    try {
      const result = await bounded(resolve => new B.Geocoder().getLocation(point, resolve), '地址查询超时，请重新选点');
      if (!alive || token !== generation) return;
      const c = result?.addressComponents;
      if (!result?.address || !c) throw new Error('未找到此处的地址，请移动地图或重新搜索');
      showSelection({ name: candidate?.title || result.address, address: candidate?.address || result.address, city: c.city || c.province || '', district: c.district || '', lng: point.lng, lat: point.lat, coordinateSystem: 'bd09' });
      setCity(c.city || c.province || city);
      say();
    } catch (error) {
      if (alive && token === generation) say(error.message, true);
    }
  }
  function chooseCandidate(p) {
    stage('map');
    map.centerAndZoom(p.point, 17);
    void selectPoint(p.point, p);
  }
  function renderRecent(rows) {
    const seen = new Set();
    const values = [...(recentSelections.get(user.id) || []), ...rows].filter(p => {
      if (!p || !validPoint(p) || p.coordinateSystem !== 'bd09' || !p.name || !p.address) return false;
      const key = `${p.name}:${p.lat}:${p.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
    const list = find('.place-recent-list');
    list.replaceChildren();
    for (const p of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `${icon('clock')}<span><strong>${esc(p.name)}</strong><small>${esc(addressLine(p))}</small></span>${icon('arrow')}`;
      button.addEventListener('click', async () => {
        invalidate();
        const token = generation;
        try {
          await initialize();
          if (alive && token === generation) chooseCandidate({ title: p.name, address: p.address, point: new B.Point(p.lng, p.lat) });
        } catch (error) { if (alive && token === generation) say(error.message, true, true); }
      });
      list.append(button);
    }
    find('.place-recent').hidden = !values.length;
  }
  async function search() {
    clearTimeout(timer);
    const q = input.value.trim(), token = ++searchGeneration;
    stage('search');
    find('[data-pick=clear]').hidden = !q;
    find('.place-results').replaceChildren();
    if (!q) return say();
    if (!city) {
      find('.place-city-editor').hidden = false;
      find('[data-pick=city]').setAttribute('aria-expanded', 'true');
      return say('请选择搜索城市');
    }
    say('正在搜索…');
    try {
      await initialize();
      if (!alive || token !== searchGeneration) return;
      const key = JSON.stringify([city, q]);
      if (!searches.has(key)) {
        const request = bounded((resolve, reject) => {
          const local = new B.LocalSearch(city, { pageCapacity: 8, onSearchComplete(result) {
            const code = local.getStatus();
            if (![0, 1, 2].includes(code)) return reject(new Error('地点搜索暂不可用，请重新搜索'));
            const list = [];
            if (code === 0 && result) for (let i = 0; i < Math.min(result.getCurrentNumPois(), 8); i++) {
              const p = result.getPoi(i);
              if (validPoint(p?.point)) list.push(p);
            }
            resolve(list);
          } });
          local.search(q);
        }, '搜索超时，请重试');
        searches.set(key, request);
        request.catch(() => searches.delete(key));
      }
      const rows = await searches.get(key);
      if (!alive || token !== searchGeneration) return;
      for (const p of rows) {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `${icon('pin')}<span><strong>${esc(p.title)}</strong><small>${esc(addressLine(p))}</small></span>${icon('arrow')}`;
        button.addEventListener('click', () => chooseCandidate(p));
        find('.place-results').append(button);
      }
      if (rows.length) {
        const help = document.createElement('p');
        help.className = 'place-no-match';
        help.innerHTML = '没有合适的地点？<button type="button" data-pick="manual">手动填写地址</button>';
        find('.place-results').append(help);
      }
      say(rows.length ? '' : `在${city}未找到匹配地点，可修改关键词或切换城市`, !rows.length);
    } catch (error) {
      if (alive && token === searchGeneration) say(error.message, true, !map);
    }
  }
  async function initialize() {
    if (map) return;
    if (initializing) return initializing;
    initializing = (async () => {
      if (config?.provider !== 'baidu' || !config.browserAk) throw new Error('地图暂不可用，可以手动填写地址');
      B = await loadBaiduMap(config.browserAk);
      if (!alive) return;
      map = new B.Map(find('.place-map'), { enableMapClick: false, enableIconClick: false });
      // 此时地图隐藏；取得所选地点或城市的真实坐标后才显示。
      map.enableScrollWheelZoom(true);
      map.addControl(new B.ScaleControl({ anchor: 2 }));
      resize = new ResizeObserver(() => { if (!find('.place-map-wrap').hidden) map.checkResize(); });
      resize.observe(find('.place-map'));
      map.addEventListener('dragstart', () => { invalidate(); say(); });
      map.addEventListener('dragend', () => void selectPoint(map.getCenter()));
      map.addEventListener('click', event => {
        if (validPoint(event.point)) { map.panTo(event.point); void selectPoint(event.point); }
      });
    })();
    try { await initializing; } finally { initializing = null; }
  }
  function inputChanged() {
    invalidate();
    stage('search');
    find('[data-pick=clear]').hidden = !input.value;
    find('.place-results').replaceChildren();
    say();
    if (!composing && input.value.trim()) timer = setTimeout(() => void search(), 350);
  }
  input.addEventListener('input', inputChanged);
  input.addEventListener('compositionstart', () => { composing = true; invalidate(); });
  input.addEventListener('compositionend', () => { composing = false; inputChanged(); });
  find('.place-search').addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation(); invalidate(); void search();
  });
  find('.place-city-editor').addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    const value = find('[name=city]').value.trim();
    if (!value) return;
    invalidate(); setCity(value);
    find('.place-city-editor').hidden = true;
    find('[data-pick=city]').setAttribute('aria-expanded', 'false');
    input.focus(); void search();
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-pick]');
    if (!button || button.disabled) return;
    const action = button.dataset.pick;
    if (action === 'close' || action === 'manual') {
      if (action === 'manual') returnFocus = document.querySelector('#publish-form [name=address]');
      dialog.close(); return;
    }
    if (action === 'confirm' && selected) {
      if (user.id) recentSelections.set(user.id, [selected, ...(recentSelections.get(user.id) || [])
        .filter(p => p.name !== selected.name || p.lat !== selected.lat || p.lng !== selected.lng)].slice(0, 5));
      onChoose(selected); dialog.close(); return;
    }
    if (action === 'city') {
      const editor = find('.place-city-editor');
      editor.hidden = !editor.hidden;
      button.setAttribute('aria-expanded', String(!editor.hidden));
      if (!editor.hidden) { invalidate(); stage('search'); find('.place-results').replaceChildren(); find('[name=city]').focus(); }
      else void search();
      return;
    }
    if (action === 'clear') { input.value = ''; inputChanged(); input.focus(); return; }
    if (action === 'search-mode') { invalidate(); stage('search'); say(); input.focus(); return; }
    if (action === 'org') {
      invalidate(); setCity(cityName(user.region)); input.value = user.address; await search(); return;
    }
    invalidate();
    const token = generation;
    button.disabled = true;
    try {
      say(action === 'locate' ? '正在获取当前位置…' : '正在加载地图…');
      await initialize();
      if (!alive || token !== generation) return;
      if (action === 'retry') { say(); if (input.value.trim()) await search(); return; }
      let point;
      const reusablePlace = place && place.city === city ? place : null;
      if (action === 'locate') {
        const coords = await currentLocation(true);
        if (!alive || token !== generation) return;
        const result = await bounded(resolve => new B.Convertor().translate([new B.Point(coords.lng, coords.lat)], 1, 5, resolve), '位置转换超时，请重试');
        if (result?.status !== 0 || !validPoint(result.points?.[0])) throw new Error('位置转换失败，请搜索地点');
        point = result.points[0];
      } else if (action === 'map') {
        if (reusablePlace) point = new B.Point(reusablePlace.lng, reusablePlace.lat);
        else {
          if (!city) throw new Error('请选择搜索城市');
          point = await bounded(resolve => new B.Geocoder().getPoint(city, resolve, city), '地区加载超时，请重试');
          if (!validPoint(point)) throw new Error('无法定位这个城市，请修改城市名称');
        }
      }
      if (!alive || token !== generation) return;
      stage('map');
      map.centerAndZoom(point, action === 'map' && !reusablePlace ? 13 : 17);
      if (action === 'locate' || reusablePlace) await selectPoint(point, action === 'map' ? { title: reusablePlace.name, address: reusablePlace.address } : undefined);
      else say();
    } catch (error) {
      if (alive && token === generation) say(error.message, true, !map);
    } finally { button.disabled = false; }
  });
  dialog.addEventListener('close', () => {
    alive = false; generation++; searchGeneration++; clearTimeout(timer); resize?.disconnect(); dialog.remove();
    if (returnFocus?.isConnected) { returnFocus.closest('details')?.setAttribute('open', ''); returnFocus.focus(); }
  }, { once: true });
  renderRecent([]);
  if (loadRecent) void loadRecent().then(rows => { if (alive) renderRecent(rows); }).catch(() => {
    if (alive) find('.place-search-hint').textContent = '最近地点暂未加载，可直接搜索地点';
  });
  const initialGeneration = generation;
  try {
    await initialize();
    if (!alive || generation !== initialGeneration) return;
    if (query) await search();
    else if (place) chooseCandidate({ title: place.name, address: place.address, point: new B.Point(place.lng, place.lat) });
  } catch (error) { if (alive) say(error.message, true, true); }
}
