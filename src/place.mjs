import transform from 'coordtransform';
import { check, text } from './common.mjs';

// Keep the original Baidu point for editing. Existing contribution grids use WGS84.
// coordtransform's inverse is approximate; never use it to assert arrival accuracy.
export function normalizePlace(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), '请选择有效的服务地点');
  check(value.coordinateSystem === 'bd09', '地点坐标类型无效，请重新选址');
  const lat = Number(value.lat),
    lng = Number(value.lng);
  check(
    value.lat !== '' &&
      value.lng !== '' &&
      value.lat != null &&
      value.lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 85 &&
      Math.abs(lng) <= 180,
    '地点坐标无效，请重新选址',
  );
  const place = {
    name: text(value.name, '地点名称', 150),
    address: text(value.address, '地点地址', 300),
    city: text(value.city || '', '城市', 80, false),
    district: text(value.district || '', '区县', 80, false),
    lat,
    lng,
    coordinateSystem: 'bd09',
  };
  const [gcjLng, gcjLat] = transform.bd09togcj02(lng, lat);
  const [wgsLng, wgsLat] = transform.gcj02towgs84(gcjLng, gcjLat);
  return { place, lat: wgsLat, lng: wgsLng };
}
