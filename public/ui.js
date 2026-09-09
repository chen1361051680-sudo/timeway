export const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const paths = {
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15',
  heart: 'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  clock: 'M12 8v5l3 2M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  user: 'M20 21v-2a7 7 0 00-14 0v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
  bell: 'M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0zM15 10a3 3 0 11-6 0 3 3 0 016 0z',
  back: 'M15 18l-6-6 6-6',
  arrow: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0z',
  calendar: 'M4 5h16v16H4zM4 10h16M8 2v6M16 2v6',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M6 18L18 6',
  leaf: 'M20 3C7 2 1 9 6 15s16 2 14-12zM4 21L16 8',
};
export const icon = (name = 'heart') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.heart}"/></svg>`;
export const dateTime = (v) =>
  v
    ? new Date(v).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';
export const localTime = (v) => {
  const d = new Date(v || Date.now());
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const hours = (n) => Number((Number(n || 0) / 60).toFixed(2));
export const labels = {
  in_progress: '进行中',
  ended: '已结束',
  draft: '草稿',
  published: '招募中',
  paused: '已暂停',
  cancelled: '已取消',
  pending: '待确认',
  accepted: '待服务',
  rejected: '未通过',
  withdrawn: '已退出',
  checked_in: '服务中',
  submitted: '待核实',
  disputed: '异议处理中',
  confirmed: '已完成',
  revoked: '已撤销',
  reschedule: '改约待确认',
  result_pending: '待确认结果',
  completed: '已完成',
};
export const status = (s) => `<span class="badge status-${esc(s)}">${esc(labels[s] || s)}</span>`;
export const btn = (label, action, id = '', cls = 'secondary', extra = '') =>
  `<button type="button" class="${cls}" data-action="${esc(action)}" data-id="${esc(id)}" ${extra}>${label}</button>`;
export const link = (label, to, cls = 'secondary') => `<a class="${cls}" href="#${esc(to)}">${label}</a>`;
export const empty = (title = '还没有记录', sub = '完成一次行动，让温暖从这里开始。') =>
  `<div class="empty">${icon('leaf')}<h3>${esc(title)}</h3><p>${esc(sub)}</p></div>`;
export const field = (name, label, value = '', type = 'text', required = true, extra = '') =>
  `<label class="field">${esc(label)}${type === 'textarea' ? `<textarea name="${name}" ${required ? 'required' : ''} ${extra}>${esc(value)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${extra}>`}</label>`;
export const select = (name, label, options, value = '') =>
  `<label class="field">${esc(label)}<select name="${name}">${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    })
    .join('')}</select></label>`;
export const categories = ['陪伴交流', '生活协助', '出行陪同', '陪诊协助', '数字助老', '其他'];
export function taskCard(t) {
  return `<a class="task-card" href="#task/${esc(t.id)}"><div class="category-art art-${categories.indexOf(t.category) % 3}">${icon(t.kind === 'redeem' ? 'leaf' : t.category === '出行陪同' ? 'pin' : 'heart')}<span>${esc(t.category)}</span></div><div class="task-content"><div class="between"><h3>${esc(t.title || '未命名草稿')}</h3>${status(t.application?.status || t.displayStatus || t.status)}</div><p class="org">${esc(t.orgName)}</p><p>${icon('pin')}${esc(t.region)}</p><div class="chips"><span>${icon('calendar')}${dateTime(t.start)}</span><span>${hours(t.minutes)} 小时</span></div><div class="between"><small>${t.hasPendingChange ? '安排变更待确认' : t.kind === 'redeem' ? '兑换占用对应机构时长' : `剩余 ${t.remaining} 个名额`}</small><span class="text-action">查看详情 ${icon('arrow')}</span></div>${t.newApplicants ? `<small class="attention">${t.newApplicants} 个新报名待处理</small>` : ''}</div></a>`;
}
export const bookingCard = (b) =>
  `<a class="card booking-card" href="#booking/${esc(b.id)}"><div class="between"><h3>${esc(b.title)}</h3>${status(b.status)}</div><p>${esc(b.orgName)} · ${esc(b.applicant)}</p><p>${icon('calendar')}${dateTime(b.start)} — ${dateTime(b.end)}</p><div class="between"><small>${esc(b.region)}</small><b>${b.status === 'completed' ? '已使用 ' + hours(b.charged) : '占用 ' + hours(b.held)} 小时</b></div></a>`;
