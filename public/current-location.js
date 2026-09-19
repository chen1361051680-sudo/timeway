import { locationAccessMessage } from './location-access.js';

let cached = null;
let pending = null;

export function cachedLocation() {
  return cached && Date.now() - cached.at < 5 * 60000 ? cached.point : null;
}

export function currentLocation(refresh = false) {
  if (pending) return pending;
  const point = cachedLocation();
  if (point && !refresh) return Promise.resolve(point);
  const unavailable = locationAccessMessage();
  if (unavailable) return Promise.reject(new Error(unavailable));
  if (!navigator.geolocation) return Promise.reject(new Error('此浏览器不支持定位，暂时无法计算距离。'));
  cached = null;
  pending = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('定位超时，请重新定位。')), 15000);
    navigator.geolocation.getCurrentPosition(position => {
      clearTimeout(timer);
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      resolve(point);
    }, error => {
      clearTimeout(timer);
      reject(new Error(error.code === 1 ? '未获定位权限，请允许浏览器定位后重试。' : '未能获取当前位置，请重新定位。'));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: refresh ? 0 : 60000 });
  }).then(point => {
    cached = { point, at: Date.now() };
    return point;
  }).finally(() => { pending = null; });
  return pending;
}
