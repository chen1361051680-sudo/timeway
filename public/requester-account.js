import { esc, icon, btn, link, hours, empty, status } from './ui.js';
import { profileIcon } from './profile.js';
import { requesterIcon, requesterDate } from './requester-hall.js';

const serviceArt = {
  陪伴交流: ['companion', 'heart', 'pink'],
  陪诊协助: ['medical', 'people', 'blue'],
  生活协助: ['housework', 'home', 'orange'],
  出行陪同: ['walk', 'pin', 'indigo'],
};
const tabs = [
  ['ledger', '发放记录'],
  ['offers', '兑换服务'],
  ['bookings', '兑换预约'],
];
const dayKey = (value) =>
  value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) : '';
const dayLabel = (value) => {
  if (!value) return '待确认';
  const [, month, day] = dayKey(value).split('-');
  return `${Number(month)}月${Number(day)}日`;
};
export const settingsGlyph =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3 1-1h4l1 1 1 2 3 1 1 3 2 2v3l-2 2-1 3-3 1-1 2h-5l-1-2-3-1-1-3-2-2v-3l2-2 1-3 3-1Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="4"/></svg>';

export function accountIcon(name) {
  const shapes = {
    community:
      '<path d="M3 22V11h5V5l4-3 4 3v6h5v11H3Z" fill="currentColor"/><path d="M1 22h22M6 15v4m12-4v4M12 7v1m0 4v1m0 5v4" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/>',
    pending:
      '<rect x="3" y="2" width="14" height="20" rx="3" fill="currentColor"/><circle cx="16" cy="8" r="6" fill="currentColor" stroke="white" stroke-width="1.4"/><path d="M16 4v4l3 1M7 14h4m-4 4h3" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round"/>',
    hourglass:
      '<path d="M5 2h14M5 22h14M6 3v3c0 3 6 6 6 6s6-3 6-6V3M6 21v-3c0-3 6-6 6-6s6 3 6 6v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="m8 21 4-5 4 5" fill="currentColor"/>',
    bell: '<path d="M3 19h18l-3-4V9a6 6 0 0 0-12 0v6zM12 1v3" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 21a3 3 0 0 0 6 0" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 11v6m0-11v1" stroke="white" stroke-width="2" stroke-linecap="round"/>',
    heart: '<path d="m12 22-9-9C-3 5 6-1 12 6c6-7 15-1 9 7Z" fill="currentColor"/>',
    home: '<path d="M1 11 12 1l11 10-3 1v11h-6v-7h-4v7H4V12Z" fill="currentColor"/>',
  };
  return shapes[name]
    ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]}</svg>`
    : requesterIcon(name);
}

export function bookingNeedsRequester(b, orgId) {
  return (
    b.status === 'pending' ||
    b.status === 'disputed' ||
    (b.status === 'reschedule' && b.change?.by !== orgId) ||
    (!!b.correction && b.correction.by !== orgId)
  );
}

// One current service record per volunteer; ledger corrections and redemptions
// never become duplicate volunteer contributions in the issuance list.
export function requesterIssueRecords(tasks, filter = {}) {
  return tasks
    .filter((t) => t.kind === 'help')
    .flatMap((task) =>
      (task.applications || [])
        .filter((a) => a.record)
        .map((a) => ({
          ...a.record,
          task,
          volunteer: a.volunteer,
          date: filter.mode === 'pending' ? a.record.updated : a.record.confirmedAt || a.record.updated,
        })),
    )
    .filter(
      (r) =>
        (filter.mode === 'pending'
          ? ['submitted', 'disputed'].includes(r.status)
          : !!r.confirmedAt || r.confirmed > 0) &&
        (!filter.date || dayKey(r.date) === filter.date) &&
        (!filter.task || r.taskId === filter.task),
    )
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
}

function recordCard(r, pending = false) {
  const [art, glyph, color] = serviceArt[r.task.category] || ['companion', 'heart', 'pink'];
  const label =
    r.status === 'disputed'
      ? '有异议'
      : r.status === 'revoked'
        ? '已撤销'
        : r.status === 'submitted'
          ? '待核实'
          : r.revision > 1
            ? '已更正'
            : '已确认';
  const tone = r.status === 'confirmed' ? 'green' : r.status === 'revoked' ? 'gray' : 'amber';
  const action = pending ? '去核实' : '查看记录';
  return `<a class="rb-record" href="#task/${esc(r.taskId)}/records/${esc(r.id)}" aria-label="${esc(r.volunteer?.name || '志愿者')}，${esc(r.task.title)}，${action}">
    <span class="rb-avatar ${art}" aria-hidden="true"></span><div class="rb-record-body"><h2>${esc(r.volunteer?.name || '志愿者')}</h2><p class="rb-record-service"><span class="${color}">${accountIcon(glyph)}</span>${esc(r.task.title)}</p>
    <div class="rb-record-details"><div>${icon('clock')}<span><small>${pending ? '待核实时长' : '已确认发放'}</small><strong>${hours(pending ? Math.max(0, r.submitted - r.confirmed) : r.confirmed)}小时</strong></span></div><div>${icon('calendar')}<span><small>${pending ? '提交日期' : '确认日期'}</small><strong>${esc(dayLabel(r.date))}</strong></span></div></div>
    ${r.revision > 1 || r.status === 'revoked' || r.status === 'disputed' ? `<p class="rb-record-change">${esc(r.dispute || r.reason || '记录已更新，点击查看核实详情')}</p>` : ''}</div>
    <span class="rb-record-state ${tone}">${requesterIcon(tone === 'green' ? 'check' : 'record')}${label}</span><span class="ra-outline rb-record-action">${action}${icon('arrow')}</span>
  </a>`;
}
function offerCard(t) {
  const [art] = serviceArt[t.category] || ['companion'];
  return `<a class="rb-offer" href="#task/${esc(t.id)}"><img src="/images/hall-${art}.webp" alt="" loading="lazy"><div><div class="rb-offer-heading"><h2>${esc(t.title || '未命名草稿')}</h2>${status(t.displayStatus || t.status)}</div><p>${icon('pin')}${esc(t.region)}</p><p>${icon('calendar')}${esc(requesterDate(t.start))}</p><p>所需 ${hours(t.minutes)} 小时 · 剩余 ${t.remaining}/${t.capacity} 名额</p><span class="rb-offer-action">${t.status === 'draft' ? '查看草稿' : '管理服务'}${icon('arrow')}</span></div></a>`;
}
function bookingCard(b, orgId) {
  return `<a class="rb-booking" href="#booking/${esc(b.id)}"><div class="rb-offer-heading"><h2>${esc(b.title)}</h2>${status(b.status)}</div><p>${icon('user')}申请人：${esc(b.applicant)}</p><p>${icon('calendar')}${esc(requesterDate(b.start))}</p><div class="rb-booking-bottom"><span>${b.status === 'completed' ? `已兑换 ${hours(b.charged)} 小时` : ['cancelled', 'rejected'].includes(b.status) ? '时间占用已释放' : `预约 ${hours(b.held)} 小时`}</span><span class="ra-outline">${bookingNeedsRequester(b, orgId) ? '去处理' : '查看安排'}${icon('arrow')}</span></div></a>`;
}
function filterButton(label, type, glyph, selected) {
  return btn(
    `${icon(glyph)}<span>${esc(label)}</span>${icon('chevron')}`,
    'requester-bank-filter',
    type,
    `rb-filter${selected ? ' selected' : ''}`,
    'aria-haspopup="dialog"',
  );
}
export function requesterBank({
  user,
  bank,
  tasks,
  tab = 'ledger',
  filter = {},
  bookingStatus = '',
  bookingWorkOnly = false,
}) {
  const records = requesterIssueRecords(tasks, filter);
  const offers = tasks.filter((t) => t.kind === 'redeem');
  const pendingBookings = bank.bookings.filter((b) => bookingNeedsRequester(b, user.id));
  const bookings = bank.bookings
    .filter(
      (b) =>
        (!bookingStatus || b.status === bookingStatus) &&
        (!bookingWorkOnly || bookingNeedsRequester(b, user.id)),
    )
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const metric = (label, value, unit, glyph, color, id) =>
    btn(
      `<span class="rb-metric-heading"><span class="rb-metric-icon">${accountIcon(glyph)}</span><span>${label}</span></span><span class="rb-metric-value"><strong>${value}</strong><span>${unit}</span>${icon('arrow')}</span>`,
      'requester-bank-metric',
      id,
      `rb-metric ${color}`,
      `aria-label="${label} ${value}${unit}"`,
    );
  return `<header class="ra-header rb-header"><h1>时间银行</h1><p>记录每一份服务 让时间汇聚成温暖</p></header>
    <section class="rb-summary" aria-label="本机构时间统计"><div class="rb-org"><span class="rb-org-icon">${accountIcon('community')}</span><div>${btn(`${esc(user.name)}${icon('arrow')}`, 'requester-org-info', '', 'rb-org-name')}<p>汇聚社区力量 · 用时间传递温暖</p></div>${btn(`查看记录${icon('arrow')}`, 'requester-bank-metric', 'issued', 'ra-outline rb-view-records')}</div>
    <div class="rb-metrics">${metric('已确认发放时长', hours(bank.issued), '小时', 'time', 'red', 'issued')}${metric('待核实时长', hours(bank.pending), '小时', 'pending', 'blue', 'pending')}${metric('待处理兑换', pendingBookings.length, '条', 'hourglass', 'amber', 'bookings')}</div>
    <p class="rb-summary-note">${accountIcon('info')}<span>此处仅统计本机构已确认发放的志愿服务时长，不显示志愿者个人余额。</span></p></section>
    <section class="rb-content"><div class="rb-tabs" role="tablist" aria-label="时间银行记录">${tabs.map(([id, title]) => btn(title, 'bank-tab', id, `rb-tab${tab === id ? ' active' : ''}`, `id="rb-tab-${id}" role="tab" aria-selected="${tab === id}" aria-controls="rb-panel"`)).join('')}</div>
    <div id="rb-panel" role="tabpanel" aria-labelledby="rb-tab-${tab}">${tab === 'ledger' ? `<div class="rb-filters">${filterButton(filter.date ? dayLabel(filter.date + 'T12:00:00+08:00') : '日期', 'date', 'calendar', filter.date)}${filterButton(filter.task ? tasks.find((t) => t.id === filter.task)?.title || '已选任务' : '任务', 'task', 'grid', filter.task)}${filter.date || filter.task || filter.mode ? btn('重置', 'requester-bank-reset', '', 'rb-reset') : ''}</div>${filter.mode === 'pending' ? '<p class="rb-list-heading">待核实服务记录</p>' : ''}<div class="rb-records">${records.map((r) => recordCard(r, filter.mode === 'pending')).join('') || empty(filter.mode === 'pending' ? '暂无待核实的服务记录' : '暂无符合条件的发放记录', '经核实的实际服务会在这里留下时间记录。')}</div>` : tab === 'offers' ? `${link(`${icon('plus')}新增兑换服务`, 'publish/redeem', 'rb-publish')}<div class="rb-offers">${offers.map(offerCard).join('') || empty('还没有兑换服务', '发布本机构实际可以提供的服务，让志愿时间传递温暖。')}</div>` : `<div class="rb-booking-filters">${filterButton(bookingStatus ? { pending: '待确认', accepted: '待服务', reschedule: '改约待确认', result_pending: '待确认结果', disputed: '异议处理中', completed: '已完成', cancelled: '已取消', rejected: '未通过' }[bookingStatus] : '预约状态', 'booking-status', 'filter', bookingStatus)}${btn(bookingWorkOnly ? '待处理事项' : '仅看待处理', 'requester-booking-work', '', `rb-filter${bookingWorkOnly ? ' selected' : ''}`, `aria-pressed="${bookingWorkOnly}"`)}</div><div class="rb-bookings">${bookings.map((b) => bookingCard(b, user.id)).join('') || empty('暂无相关兑换预约', '新的预约申请会在这里显示。')}</div>`}</div></section>`;
}

export function requesterProfile(user, summary, bank) {
  const stat = (glyph, label, value, unit, action, id, color) =>
    btn(
      `<span class="rp-stat-icon ${color}">${profileIcon(glyph)}</span><span class="rp-stat-copy"><span>${label}</span><span class="rp-stat-value"><strong>${esc(value)}</strong><span>${unit}</span>${icon('arrow')}</span></span>`,
      action,
      id,
      'rp-stat',
      `aria-label="${label} ${esc(value)}${unit}"`,
    );
  const rows = [
    ['map', 'mint', '本机构爱心成果', '查看组织帮扶形成的点亮片区和服务成果', 'footprints'],
    ['clipboard', 'blue', '帮扶记录', '查看本机构发布及完成的需求', 'history'],
    ['gift', 'orange', '兑换预约记录', '查看并处理兑换服务的预约申请', 'my-bookings'],
    ['message', 'pink', '业务消息', '查看新报名、服务提交、兑换申请及变更提醒', 'notices'],
  ];
  return `<header class="rp-cover"><h1>我的</h1><p>汇聚社区力量 让每一份帮助有回响</p>${btn(settingsGlyph, 'settings', '', 'rp-settings', 'aria-label="设置"')}</header>
    <div class="rp-body"><section class="rp-card rp-identity" aria-label="机构资料"><span class="rp-org-emblem" role="img" aria-label="社区服务机构标识"></span><div class="rp-identity-copy"><div class="rp-name-row"><h2>${esc(user.name)}</h2><span class="rp-role">${profileIcon('user')}需求方</span>${btn(`编辑资料${icon('arrow')}`, 'edit-profile', '', 'rp-edit')}</div><p>${requesterIcon('pin')}<span>${esc(user.region || '待完善服务区域')}</span></p><p>${accountIcon('community')}<span>以社区为本，用行动传递温暖</span></p></div></section>
    <section class="rp-card rp-results" aria-labelledby="rp-results-title"><div class="rp-section-heading"><h2 id="rp-results-title">本机构成果</h2>${btn(`查看全部${icon('arrow')}`, 'footprints', '', 'rp-more')}</div><div class="rp-stats">${stat('pin', '已点亮片区', summary.places, '个', 'footprints', '', 'mint')}${stat('heart', '已完成帮扶', summary.services, '次', 'requester-completed', '', 'pink')}${stat('clock', '累计确认发放时长', hours(bank.issued), '小时', 'requester-bank-metric', 'issued', 'orange')}</div></section>
    <section class="rp-card rp-menu" aria-label="机构服务入口">${rows.map(([glyph, color, title, subtitle, action]) => btn(`<span class="rp-menu-icon ${color}">${profileIcon(glyph)}</span><span class="rp-menu-copy"><strong>${title}</strong><span>${subtitle}</span></span>${icon('arrow')}`, action, '', 'rp-menu-row')).join('')}</section></div>
    <footer class="rp-footer"><p>用爱连接社区<br><span>让更多美好发生</span></p></footer>`;
}
