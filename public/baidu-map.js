import { esc, icon } from './ui.js';
import { gridGeometry, validPoint } from './map-geo.js';
import { locationAccessMessage } from './location-access.js';

let sdkPromise;
const delayResult = (work, message, ms = 12000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    try {
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
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });

export function loadBaiduMap(ak) {
  if (globalThis.BMap?.Map) return Promise.resolve(globalThis.BMap);
  if (sdkPromise) return sdkPromise;
  sdkPromise = delayResult(
    (resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'baidu-map-sdk';
      globalThis.timewayBaiduReady = () => {
        if (globalThis.BMap?.Map) resolve(globalThis.BMap);
        else reject(new Error('百度地图初始化失败，请检查浏览器端 AK。'));
      };
      const url = new URL('https://api.map.baidu.com/api');
      url.search = new URLSearchParams({ v: '4.0', ak, callback: 'timewayBaiduReady' });
      script.src = url.href;
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onerror = () => reject(new Error('百度地图加载失败，请检查网络或浏览器拦截设置。'));
      document.head.append(script);
    },
    '百度地图加载超时，请检查网络、AK 和 Referer 白名单。',
    20000,
  ).catch((e) => {
    document.querySelector('#baidu-map-sdk')?.remove();
    sdkPromise = null;
    throw e;
  });
  return sdkPromise;
}

class LoveMap {
  constructor() {
    this.host = null;
    this.map = null;
    this.overlays = [];
    this.geometry = new Map();
    this.regions = new Map();
    this.points = new Map();
    this.generation = 0;
    this.lastCity = null;
    this.located = null;
    this.searchMarker = null;
    this.state = null;
  }
  async mount(state, callbacks) {
    this.state = state;
    this.callbacks = callbacks;
    const slot = document.querySelector('#baidu-map-slot');
    if (!slot) return;
    if (this.host) slot.append(this.host);
    const status = document.querySelector('#baidu-map-status');
    const generation = ++this.generation;
    try {
      this.B = await loadBaiduMap(state.config.map.browserAk);
      if (generation !== this.generation || !slot.isConnected) return;
      if (!this.map) {
        this.host = document.createElement('div');
        this.host.className = 'baidu-map-canvas';
        this.host.setAttribute('aria-label', '百度地图，可拖动和缩放');
        slot.append(this.host);
        this.map = new this.B.Map(this.host, { enableMapClick: false, enableIconClick: false });
        this.map.addEventListener('tilesloaded', () => {
          this.tilesReady = true;
          clearTimeout(this.tileTimer);
          const currentSlot = document.querySelector('#baidu-map-slot');
          const currentStatus = document.querySelector('#baidu-map-status');
          if (currentSlot) currentSlot.dataset.state = 'ready';
          if (currentStatus) currentStatus.hidden = true;
        });
        this.map.centerAndZoom(new this.B.Point(120.1551, 30.2741), 13);
        this.map.enableScrollWheelZoom(true);
        this.map.addControl(new this.B.ScaleControl({ anchor: 2 }));
        this.map.addEventListener('dragend', () => {
          const b = document.querySelector('[data-action="map-this-area"]');
          if (b) b.hidden = false;
        });
        // Keep copyright, provider logo and native scale visible.
        this.resize = new ResizeObserver(() => this.map.checkResize?.());
        this.resize.observe(this.host);
      } else this.map.checkResize?.();
      if (this.lastCity !== state.city) {
        if (state.city) {
          const p = await this.regionPoint(state.city);
          if (generation !== this.generation) return;
          if (p) this.map.centerAndZoom(p, state.city.length > 4 ? 15 : 13);
        }
        this.lastCity = state.city;
      }
      if (generation !== this.generation) return;
      slot.dataset.state = this.tilesReady ? 'ready' : 'loading';
      status.hidden = !!this.tilesReady;
      clearTimeout(this.tileTimer);
      if (!this.tilesReady)
        this.tileTimer = setTimeout(() => {
          if (generation !== this.generation || !status.isConnected || this.tilesReady) return;
          slot.dataset.state = 'error';
          status.innerHTML =
            '<p>地图底图暂未加载，请检查网络后重试。</p><button type="button" data-action="refresh">重试加载</button><button type="button" data-action="map-regions">查看区域与需求列表</button>';
        }, 30000);
      await this.draw(state, generation);
      return generation === this.generation && slot.isConnected;
    } catch (e) {
      if (generation !== this.generation || !status.isConnected) return;
      slot.dataset.state = 'error';
      status.hidden = false;
      status.innerHTML = `<p>${esc(e.message)}</p><button type="button" data-action="refresh">重试加载</button><button type="button" data-action="map-regions">查看区域与需求列表</button>`;
    }
  }
  suspend() {
    ++this.generation;
    clearTimeout(this.tileTimer);
    // Detach the existing map before the app replaces its page. Reattach it on return.
    this.host?.remove();
  }
  async ready() {
    if (!this.map || !this.B) throw new Error('地图尚未加载，请稍后重试或手动选择区域。');
  }
  async regionPoint(region) {
    if (!region) return null;
    if (!this.regions.has(region)) {
      const request = delayResult(
        (resolve) => new this.B.Geocoder().getPoint(region, (p) => resolve(validPoint(p) ? p : null), region),
        '地点查询超时，请重试。',
      );
      this.regions.set(region, request);
      request.then(
        (p) => {
          if (!p) this.regions.delete(region);
        },
        () => this.regions.delete(region),
      );
    }
    return this.regions.get(region);
  }
  async convert(points) {
    if (!points.every(validPoint)) throw new Error('无效的公开网格坐标');
    return delayResult(
      (resolve, reject) =>
        new this.B.Convertor().translate(
          points.map((p) => new this.B.Point(p.lng, p.lat)),
          1,
          5,
          (r) =>
            r?.status === 0 && r.points?.length === points.length && r.points.every(validPoint)
              ? resolve(r.points)
              : reject(new Error('坐标转换暂不可用，已保留区域列表。')),
        ),
      '坐标转换超时，已保留区域列表。',
    );
  }
  async cellGeometry(cell) {
    const geometry = gridGeometry(cell);
    if (!geometry) return null;
    if (!this.geometry.has(cell)) {
      const promise = this.convert([geometry.center, ...geometry.corners]).then(([center, ...corners]) => ({
        center,
        corners,
      }));
      this.geometry.set(cell, promise);
      promise.catch(() => this.geometry.delete(cell));
    }
    return this.geometry.get(cell);
  }
  pin(point, title, kind, id, selected = false) {
    const B = this.B;
    const action = kind === 'love' ? 'map-cell' : 'map-task';
    const callback = () => this.callbacks.select(action, id);
    class Pin extends B.Overlay {
      initialize(map) {
        this.map = map;
        this.el = document.createElement('button');
        this.el.type = 'button';
        this.el.className = `map-pin baidu-pin map-pin-${kind === 'love' ? 'love' : 'need'} ${selected ? 'is-selected' : ''}`;
        this.el.setAttribute('aria-label', `${kind === 'love' ? '已点亮' : '待帮助'}：${title}`);
        this.el.innerHTML = `<span class="pin-shape">${icon(kind === 'love' ? 'heart' : 'users')}</span><span class="pin-label">${esc(title)}</span>`;
        this.el.addEventListener('click', (e) => {
          e.stopPropagation();
          callback();
        });
        map.getPanes().markerPane.append(this.el);
        return this.el;
      }
      draw() {
        const p = this.map.pointToOverlayPixel(point);
        this.el.style.left = `${p.x - 20}px`;
        this.el.style.top = `${p.y - 43}px`;
      }
    }
    const pin = new Pin();
    this.map.addOverlay(pin);
    this.overlays.push(pin);
  }
  async draw(state, generation) {
    for (const overlay of this.overlays) this.map.removeOverlay(overlay);
    this.overlays = [];
    this.points.clear();
    let missing = 0;
    const nodes = [
      ...state.cells.map((c) => ({ value: c, kind: 'love', id: c.cell })),
      ...(state.showNeeds ? state.mapNeeds.map((t) => ({ value: t, kind: 'need', id: t.id })) : []),
    ];
    for (let i = 0; i < nodes.length; i += 8) {
      await Promise.all(
        nodes.slice(i, i + 8).map(async ({ value, kind, id }) => {
          try {
            const geometry = value.cell ? await this.cellGeometry(value.cell) : null;
            const point = geometry?.center || (kind === 'need' ? await this.regionPoint(value.region) : null);
            if (generation !== this.generation) return;
            if (!point) {
              missing++;
              return;
            }
            if (kind === 'love' && geometry) {
              const area = new this.B.Polygon(geometry.corners, {
                strokeColor: '#ff805b',
                strokeWeight: 2,
                fillColor: '#ff996a',
                fillOpacity: Math.min(0.42, 0.15 + value.brightness * 0.06),
              });
              area.addEventListener('click', () => this.callbacks.select('map-cell', id));
              this.map.addOverlay(area);
              this.overlays.push(area);
            }
            this.points.set(id, point);
            this.pin(
              point,
              kind === 'love' ? value.region : value.title,
              kind,
              id,
              state.selectedCell === id || state.selectedTask === id,
            );
          } catch {
            missing++;
          }
        }),
      );
      if (generation !== this.generation) return;
    }
    const note = document.querySelector('#baidu-map-note');
    if (note) note.textContent = missing ? `${missing} 个地点暂未定位，可在区域列表查看` : '公开位置已概略化';
    if (this.fittedCity !== state.city && this.points.size) {
      const view = this.map.getViewport([...this.points.values()], { margins: [150, 70, 60, 30] });
      this.map.centerAndZoom(view.center, Math.min(view.zoom, 14));
      this.fittedCity = state.city;
    }
    const selected = state.selectedTask || state.selectedCell;
    if (selected && selected !== this.lastSelected && this.points.has(selected))
      this.map.panTo(this.points.get(selected));
    this.lastSelected = selected;
  }
  async search(query) {
    await this.ready();
    if (!query.trim()) return [];
    return delayResult((resolve) => {
      const search = new this.B.LocalSearch(this.map, {
        pageCapacity: 8,
        onSearchComplete: (result) => {
          if (search.getStatus() !== 0 || !result) return resolve([]);
          const rows = [];
          for (let i = 0; i < Math.min(result.getCurrentNumPois(), 8); i++) {
            const p = result.getPoi(i);
            if (validPoint(p?.point)) rows.push({ title: p.title, address: p.address, point: p.point });
          }
          resolve(rows);
        },
      });
      search.search(query);
    }, '地点搜索超时，请重试或按区域名称查找。');
  }
  focus(point, label = '所选地点') {
    if (!this.map || !validPoint(point)) return;
    this.map.centerAndZoom(point, 16);
    if (this.searchMarker) this.map.removeOverlay(this.searchMarker);
    this.searchMarker = new this.B.Marker(point);
    this.searchMarker.setTitle(label);
    this.map.addOverlay(this.searchMarker);
  }
  async locate() {
    const unavailable = locationAccessMessage();
    if (unavailable) throw new Error(unavailable);
    await this.ready();
    if (!navigator.geolocation) throw new Error('此浏览器不支持定位，请手动搜索所在位置。');
    // No IP approximation: a denied GPS request must not appear as an exact user location.
    const coords = await delayResult(
      (resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          (e) =>
            reject(
              new Error(
                e.code === 1
                  ? '未获定位权限，请允许浏览器定位或手动搜索位置。'
                  : '未能获取当前位置，请重试或手动搜索位置。',
              ),
            ),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
        ),
      '定位超时，请手动搜索所在位置。',
      15000,
    );
    const [point] = await this.convert([{ lng: coords.longitude, lat: coords.latitude }]);
    this.located = point;
    this.focus(point, '当前位置');
    return point;
  }
  async centerRegion(point = this.map?.getCenter()) {
    await this.ready();
    return delayResult(
      (resolve) =>
        new this.B.Geocoder().getLocation(point, (r) => {
          const c = r?.addressComponents;
          resolve(c ? { city: c.city || '', district: c.district || '' } : null);
        }),
      '当前区域查询超时，请手动切换城市。',
    );
  }
  zoom(delta) {
    if (!this.map) throw new Error('地图尚未加载');
    this.map.setZoom(this.map.getZoom() + delta);
  }
}

export const baiduMap = new LoveMap();
