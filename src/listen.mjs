import { isIP } from 'node:net';

export function listenHost(environment, configuredHost) {
  // Hosted demo mode is still production and must stay behind Nginx.
  if (environment === 'production') return '127.0.0.1';
  const host = configuredHost || (environment === 'development' ? '0.0.0.0' : '127.0.0.1');
  if (!isIP(host)) throw new Error('BIND_HOST 必须为有效 IP 地址');
  return host;
}
