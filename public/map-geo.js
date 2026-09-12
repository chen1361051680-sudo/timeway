// Stored grid identifiers use WGS84 / Web Mercator, exactly like src/common.mjs.
// Only coarse cell geometry is reconstructed here, never a recipient's exact location.
export function gridGeometry(cell) {
  if (typeof cell !== 'string' || !/^-?\d+:-?\d+$/.test(cell)) return null;
  const [x, y] = cell.split(':').map(Number);
  if (![x, y].every(Number.isSafeInteger) || Math.abs(x) > 40076 || Math.abs(y) > 40076) return null;
  const point = (px, py) => ({
    lng: (((px * 500) / 6378137) * 180) / Math.PI,
    lat: ((2 * Math.atan(Math.exp((py * 500) / 6378137)) - Math.PI / 2) * 180) / Math.PI,
  });
  return {
    center: point(x + 0.5, y + 0.5),
    corners: [point(x, y), point(x + 1, y), point(x + 1, y + 1), point(x, y + 1)],
  };
}

export function validPoint(p) {
  return (
    !!p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) <= 180 && Math.abs(p.lat) <= 85
  );
}
