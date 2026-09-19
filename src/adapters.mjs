import { AppError, check } from './common.mjs';

export function externalAdapters({ environment, smsProvider = 'development', smsUrl, smsToken, mapProvider, browserAk = '' } = {}) {
  const development = environment !== 'production';
  const baiduEnabled = mapProvider !== 'manual' && !!browserAk.trim();
  return {
    // Browser AK is intentionally public and restricted by Baidu Referer rules.
    // Never expose the server AK, signature secret, or the complete environment.
    browserMap: { provider: baiduEnabled ? 'baidu' : 'manual', ...(baiduEnabled ? { browserAk: browserAk.trim(), version: '4.0' } : {}) },
    status: {
      development,
      sms:
        development && smsProvider === 'development'
          ? 'development'
          : smsProvider === 'webhook' && smsUrl && smsToken
            ? 'configured'
            : 'unavailable',
      map: baiduEnabled ? 'baidu' : 'manual',
    },
    async sendCode(phone, code) {
      if (development && smsProvider === 'development') return { developmentCode: code };
      check(smsProvider === 'webhook' && smsUrl && smsToken, '短信服务尚未接入，暂时无法发送验证码', 503);
      check(new URL(smsUrl).protocol === 'https:', '短信适配地址必须使用 HTTPS', 503);
      try {
        const r = await fetch(smsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smsToken}` },
          body: JSON.stringify({ phone, code, expiresIn: 300 }),
          signal: AbortSignal.timeout(10000),
        });
        check(r.ok, '验证码发送失败，请稍后重试', 503);
        return {};
      } catch {
        throw new AppError(503, '验证码发送失败，请稍后重试');
      }
    },
    route() {
      return {
        provider: 'manual',
        minutes: null,
        returnMinutes: null,
        distance: null,
        message: '地图路线尚未接入，请手动确认地址；未知耗时不计为零。',
      };
    },
  };
}
