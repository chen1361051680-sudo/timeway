export function locationAccessMessage(context = globalThis) {
  return context.isSecureContext === false
    ? '当前通过 HTTP 局域网地址访问，浏览器不支持 GPS 定位。请手动选择地区或搜索地址；GPS 定位需要在 HTTPS 页面使用。'
    : '';
}
