export const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const paths = {
  tag: 'M3 3h8l10 10-8 8L3 11V3zM7 7h.01',
  'help-circle': 'M9 9a3 3 0 016 0c0 2-3 2-3 5m0 3h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  'chevron-down': 'M6 9l6 6 6-6',
  filter: 'M3 3h18l-7 9v9l-4-2v-7L3 3z',
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M20 12a8 8 0 11-16 0 8 8 0 0116 0zM16 12a4 4 0 11-8 0 4 4 0 018 0z',
  info: 'M12 11v6m0-10v.1M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  navigation: 'M21 3l-6 18-4-8-8-4 18-6z',
  building: 'M5 21V5h14v16M3 21h18M9 8h1m4 0h1m-6 4h1m4 0h1m-6 9v-5h6v5M3 5l9-3 9 3',
  medical: 'M4 6h16v15H4zM8 6V3h8v3m-4 4v7m-3-3.5h6',
  utensils: 'M5 3v6m3-6v6m3-6v6M5 8c0 4 6 4 6 0M8 12v9M19 3v18m0-18c-4 3-4 9 0 9',
  accessible: 'M12 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 8v6h6l3 7M11 10h6M8 11a6 6 0 106 10',
  book: 'M12 5v16M12 5C9 2 5 2 2 3v16c4-1 7-1 10 2 3-3 6-3 10-2V3c-3-1-7-1-10 2z',
  footprints:
    'M8 10c3 1 3 5 1 7-2 2-5 0-5-3s1-5 4-4zM5 6v1m4-3v2m8 7c3 0 4 3 3 6-1 3-4 4-5 1-1-3-1-6 2-7zM16 9v1m4-2v2',
  sprout: 'M12 22V12M12 16C3 17 1 11 2 5c7 0 11 4 10 11zM12 12C12 5 17 2 23 3c-1 7-5 10-11 9',
  home: 'M2 11l10-9 10 9M5 9v13h14V9M9 22v-7h6v7M9 10h.01M15 10h.01',
  chevron: 'M6 9l6 6 6-6',
  sort: 'M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4',
  car: 'M4 10l2-6h12l2 6M3 17V11l2-1h14l2 1v6H3zM5 17v3M19 17v3M6 13h2M16 13h2',
  bus: 'M6 3h12a2 2 0 012 2v13H4V5a2 2 0 012-2zM4 11h16M8 6h8M7 15h1M16 15h1M7 18l-2 4M17 18l2 4',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15',
  heart: 'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  clock: 'M12 8v5l3 2M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  user: 'M20 21v-2a7 7 0 00-14 0v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
  'user-filled': 'M12 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM4 20a8 8 0 0116 0v1H4z',
  'users-filled':
    'M12 2a3.6 3.6 0 110 7.2A3.6 3.6 0 0112 2zM4.5 4a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6zM19.5 4a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6zM12 10.5a5.5 5.5 0 015.5 5.5v5h-11v-5a5.5 5.5 0 015.5-5.5zM4.5 11c.6 0 1.2.1 1.7.4A7 7 0 005 16v4H0v-4.5A4.5 4.5 0 014.5 11zM19.5 11A4.5 4.5 0 0124 15.5V20h-5v-4a7 7 0 00-1.2-4.6c.5-.3 1.1-.4 1.7-.4z',
  users:
    'M16 21v-2a4 4 0 00-8 0v2M15 8a3 3 0 11-6 0 3 3 0 016 0zM20 20v-2a4 4 0 00-3-3.87M18 5a3 3 0 010 6M4 20v-2a4 4 0 013-3.87M6 5a3 3 0 000 6',
  message: 'M4 3h16a2 2 0 012 2v12a2 2 0 01-2 2H8l-6 3V5a2 2 0 012-2zM7 8h10M7 13h7',
  bell: 'M5 17h14l-2-3V9a5 5 0 00-10 0v5l-2 3zM10 20a2 2 0 004 0M12 2v2',
  clipboard: 'M9 4H5v18h14V4h-4M9 2h6v5H9zM8 12h8M8 17h6',
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
export function navIcon(name) {
  const shapes = {
    map: '<path fill="currentColor" d="M1 9l7-3 8 2 7-3v15l-7 3-8-2-7 2z"/><path fill="currentColor" stroke="white" stroke-width="1.4" stroke-linejoin="round" d="M12 1a6 6 0 0 0-6 6c0 4 6 9 6 9s6-5 6-9a6 6 0 0 0-6-6z"/><path fill="white" d="M12 11l-2.8-2.8a1.9 1.9 0 0 1 2.8-2.5 1.9 1.9 0 0 1 2.8 2.5z"/>',
    grid: '<rect fill="currentColor" x="1" y="1" width="10" height="10" rx="3"/><rect fill="currentColor" x="13" y="1" width="10" height="10" rx="3"/><rect fill="currentColor" x="1" y="13" width="10" height="10" rx="3"/><rect fill="currentColor" x="13" y="13" width="10" height="10" rx="3"/>',
    clock:
      '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.7"/><path d="M12 6v7h5" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/>',
    user: '<path fill="currentColor" d="M12 1a9 9 0 0 0-5 16c-4 1-5 3-5 6h20c0-3-1-5-5-6a9 9 0 0 0-5-16z"/><path fill="white" d="M12 15l-3.3-3.3a2.2 2.2 0 0 1 3.3-2.9 2.2 2.2 0 0 1 3.3 2.9z"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]}</svg>`;
}
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
