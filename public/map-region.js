export function regionKey(region) {
  return String(region || '').replace(/[\s·•,，/]+/g, '');
}

export function boundaryQuery(region) {
  const name = regionKey(region);
  // 百度公开边界服务覆盖省、市、区县；社区和街道需要对应的边界数据。
  if (/(社区|街道|小区|乡|镇|村|开发区|园区)$/.test(name)) return '';
  return (name.length >= 3 && /(?:省|市)$/.test(name)) ||
    (name.length > 4 && /(?:区|县|旗)$/.test(name)) ? name : '';
}
