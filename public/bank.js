import { esc, icon, btn, empty, hours, status, labels, select, field, dateTime } from './ui.js';

const artwork = { 陪伴交流: 'companion', 陪诊协助: 'medical', 生活协助: 'housework', 出行陪同: 'walk' };
export const bankDate = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const clockTime = (value) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const dayLabel = (value) => {
  const [, m, d] = bankDate(value).split('-');
  return `${Number(m)}月${Number(d)}日 ${new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'short' })}`;
};
export function bankAccount(accounts, org = '') {
  return accounts
    .filter((a) => !org || a.orgId === org)
    .reduce(
      (sum, a) => {
        for (const key of Object.keys(sum)) sum[key] += a[key] || 0;
        return sum;
      },
      { available: 0, pending: 0, held: 0, used: 0, contributed: 0, disputed: 0, debt: 0 },
    );
}
export function bankOffers(offers, f) {
  return offers
    .filter(
      (t) =>
        (!f.org || t.owner === f.org) &&
        (!f.date || bankDate(t.start) === f.date) &&
        (!f.minutes || t.minutes <= Number(f.minutes)),
    )
    .sort((a, b) => {
      if (f.sort === 'minutes') return a.minutes - b.minutes || a.start.localeCompare(b.start);
      if (f.sort === 'remaining') return b.remaining - a.remaining || a.start.localeCompare(b.start);
      return a.start.localeCompare(b.start);
    });
}
function filterButton(label, id, symbol, active = false) {
  return btn(
    `${icon(symbol)}<span>${esc(label)}</span>${icon('chevron')}`,
    'bank-filter',
    id,
    `bank-filter${active ? ' selected' : ''}`,
    'aria-haspopup="dialog"',
  );
}
export function bankCard(t, account) {
  const unavailable =
    t.remaining <= 0
      ? '名额已满'
      : t.hasPendingChange
        ? '安排调整中'
        : Date.parse(t.deadline) <= Date.now()
          ? '预约已截止'
          : '';
  const insufficient = !unavailable && (account?.available || 0) < t.minutes;
  return `<a class="bank-service-card" href="#task/${esc(t.id)}" aria-label="${esc(t.title)}，查看详情">
    <img class="bank-service-image" src="/images/hall-${artwork[t.category] || 'companion'}.png" alt="" width="1024" height="1024" loading="lazy">
    <div class="bank-service-content">
      <div class="bank-service-heading"><h3>${esc(t.title)}</h3><span class="bank-cost">需要 <strong>${hours(t.minutes)}</strong> 小时</span></div>
      <p class="bank-service-org">${icon('home')}<span>${esc(t.orgName)}</span></p>
      <p class="bank-service-location">${icon('pin')}<span>${esc(t.region)}</span></p>
      <p class="bank-service-description">${esc(t.description)}</p>
      <div class="bank-service-bottom"><div class="bank-service-chips"><span>${icon('calendar')}${esc(dayLabel(t.start))}</span><span>${icon('clock')}${clockTime(t.start)}–${clockTime(t.end)}</span><span class="bank-remaining">${unavailable || `剩余 <b>${t.remaining}</b> 名`}</span></div><span class="bank-detail">查看详情</span></div>
      ${insufficient ? '<p class="bank-service-warning">该机构可用时间不足，可查看服务要求</p>' : ''}
    </div>
  </a>`;
}
function bookingTile(b) {
  const hint =
    b.status === 'reschedule'
      ? '预约时间有调整，请查看改约安排'
      : b.status === 'disputed'
        ? '服务结果存在异议，等待双方处理'
        : b.correction
          ? '扣除更正待确认'
          : b.extra
            ? '追加服务待确认'
            : '';
  return `<a href="#booking/${esc(b.id)}" class="bank-booking-card"><div class="between"><h3>${esc(b.title)}</h3>${status(b.status)}</div><p>${icon('home')}${esc(b.orgName)}</p><p>${icon('calendar')}${esc(dayLabel(b.start))} ${clockTime(b.start)}–${clockTime(b.end)}</p><div class="between"><span>${b.status === 'completed' ? `已使用 ${hours(b.charged)} 小时` : ['cancelled', 'rejected'].includes(b.status) ? '时间占用已释放' : `占用 ${hours(b.held)} 小时`}</span><span class="bank-booking-detail">查看安排 ${icon('arrow')}</span></div>${hint ? `<p class="bank-booking-hint">${hint}</p>` : ''}</a>`;
}
export function bankContent({ bank, offers, filter: f, tab, bookingStatus }) {
  const a = bankAccount(bank.accounts, f.org);
  const orgName = bank.accounts.find((a) => a.orgId === f.org)?.orgName || '全部机构';
  const shown = bankOffers(offers, f);
  const bookings = bank.bookings.filter(
    (b) => (!f.org || b.owner === f.org) && (!bookingStatus || b.status === bookingStatus),
  );
  const filtered = f.date || f.minutes || f.sort;
  return `<header class="bank-header"><h1>时间银行</h1></header>
    <section class="bank-account-card" aria-label="时间账户">
      <div class="bank-account-top"><span class="bank-org-emblem"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#f28b48" d="M4 21 21 6q3-3 6 0l17 15q2 3-2 4h-3v16H9V25H6q-4-1-2-4Z"/><path d="M20 23c-3 0-4 3-4 6s3 4 5 2 2-7-1-8Zm-2-5v1m4-2v2m7 6c3 0 4 3 3 6s-4 4-5 1-1-6 2-7Zm-1-5v1m4 0v2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg></span>${btn(`<span class="bank-org-name">${esc(orgName)}${icon('chevron')}</span><small>切换机构查看时间账户</small>`, 'bank-filter', 'org', 'bank-org-switch', 'aria-label="切换机构查看时间账户" aria-haspopup="dialog"')}${btn(`${bankIcon('ledger')}<span>收支明细</span>${icon('arrow')}`, 'bank-ledger', '', 'bank-ledger-button', 'aria-haspopup="dialog"')}</div>
      <div class="bank-account-inner"><div class="bank-metrics">
        ${btn(`<span>可用时间 ${bankIcon('question')}</span><strong>${hours(a.available)}<small>小时</small></strong>`, 'bank-account-info', '', 'bank-available', 'aria-label="可用时间及累计贡献说明"')}
        ${metric('待确认', a.pending, 'clock', 'pending')}${metric('兑换占用', a.held, 'hourglass', 'hold')}${metric('已使用', a.used, 'checked', 'redeem')}
      </div><p class="bank-account-note">${icon('info')}<span>时间权益仅可用于兑换${f.org ? '本' : '对应'}机构提供的公益服务，不能转让或提现。</span></p>${a.debt || a.disputed ? `<p class="bank-account-alert">${a.disputed ? `异议冻结 ${hours(a.disputed)} 小时。` : ''}${a.debt ? `更正后待补足 ${hours(a.debt)} 小时，暂不可新增兑换。` : ''}</p>` : ''}</div>
    </section>
    <section class="bank-services" aria-label="时间兑换"><div class="bank-tabs" role="tablist" aria-label="时间银行列表">${btn('可兑换服务', 'bank-tab', 'offers', `bank-tab${tab === 'offers' ? ' active' : ''}`, `role="tab" aria-selected="${tab === 'offers'}"`)}${btn('我的兑换', 'bank-tab', 'bookings', `bank-tab${tab === 'bookings' ? ' active' : ''}`, `role="tab" aria-selected="${tab === 'bookings'}"`)}</div>
    ${
      tab === 'offers'
        ? `<div class="bank-filters" aria-label="兑换服务筛选">${filterButton(f.date ? f.date.slice(5).replace('-', '/') : '预约日期', 'date', 'calendar', !!f.date)}${filterButton(f.minutes ? `${hours(f.minutes)}小时内` : '所需时长', 'minutes', 'clock', !!f.minutes)}${filterButton({ minutes: '时长优先', remaining: '名额优先', start: '时间优先' }[f.sort] || '默认排序', 'sort', 'sort', !!f.sort)}</div>${filtered ? `<div class="bank-filter-summary"><span>${f.org ? esc(orgName) + ' · ' : ''}找到 ${shown.length} 项服务</span>${btn('重置筛选', 'bank-reset', '', 'text-button')}</div>` : ''}<div class="bank-service-list">${
            shown.length
              ? shown
                  .map((t) =>
                    bankCard(
                      t,
                      bank.accounts.find((a) => a.orgId === t.owner),
                    ),
                  )
                  .join('')
              : `<div class="bank-empty">${empty('暂无可兑换服务', filtered ? '试试调整机构、预约日期或所需时长。' : '机构发布可预约服务后，会在这里与你相遇。')}${btn('调整筛选', 'bank-filter', 'org', 'secondary')}${filtered ? btn('重置筛选', 'bank-reset', '', 'text-button') : ''}</div>`
          }</div>`
        : `<div class="bank-booking-statuses" aria-label="兑换状态">${[['', '全部'], ...['pending', 'accepted', 'result_pending', 'completed', 'cancelled', 'reschedule', 'disputed', 'rejected'].map((s) => [s, s === 'result_pending' ? '待结果确认' : labels[s]])].map(([s, label]) => btn(label, 'bank-booking-status', s, `bank-booking-status${(bookingStatus || '') === s ? ' active' : ''}`, `aria-pressed="${(bookingStatus || '') === s}"`)).join('')}</div><div class="bank-bookings">${bookings.length ? bookings.map(bookingTile).join('') : `<div class="bank-empty">${empty('暂无兑换记录', '选择合适的服务，让积累的时间带来一份帮助。')}${btn('看看可兑换服务', 'bank-tab', 'offers', 'secondary')}</div>`}</div>`
    }
    </section>`;
}
function metric(label, value, symbol, type) {
  return btn(
    `<span>${bankIcon(symbol)}${label}</span><strong>${hours(value)}<small>小时</small></strong>`,
    'bank-ledger',
    type,
    'bank-metric',
    `aria-label="${label} ${hours(value)} 小时，查看明细"`,
  );
}
export function bankIcon(name) {
  const shapes = {
    hourglass: 'M5 2h14v3c0 4-7 5-7 7s7 3 7 7v3H5v-3c0-4 7-5 7-7S5 9 5 5zM8 19h8',
    checked: 'M8 12l3 3 5-6M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
    ledger: 'M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM8 7h8M8 11h3m3 0h2M8 15h6',
    question: 'M9 8a3 3 0 116 1c0 2-3 2-3 5m0 3v.1M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  };
  return shapes[name]
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shapes[name]}"/></svg>`
    : icon(name);
}

export function bankLedger(bank, records, f) {
  const kinds = [
    ['', '全部记录'],
    ['credit', '服务入账'],
    ['pending', '待确认'],
    ['hold', '兑换占用'],
    ['redeem', '兑换使用'],
    ['release', '占用释放'],
    ['correction', '时长更正'],
    ['refund', '兑换退回'],
  ];
  const rows = bank.ledger.map((r) => ({
    ...r,
    target: `task/${r.task_id}`,
    state:
      r.kind === 'redeem'
        ? '已扣除'
        : r.kind === 'refund'
          ? '已退回'
          : r.kind === 'correction'
            ? '已更正'
            : '已入账',
  }));
  for (const r of records.filter((r) => ['submitted', 'disputed'].includes(r.status)))
    rows.push({
      org_id: r.owner,
      orgName: bank.accounts.find((a) => a.orgId === r.owner)?.orgName,
      kind: 'pending',
      minutes: Math.max(0, r.submitted - r.confirmed),
      note: '服务时长待核实，尚未计入可用时间',
      created: r.updated,
      state: labels[r.status],
      target: `task/${r.taskId}`,
    });
  for (const b of bank.bookings) {
    if (b.held)
      rows.push({
        org_id: b.owner,
        orgName: b.orgName,
        kind: 'hold',
        minutes: b.held,
        note: b.title,
        created: b.updated,
        state: labels[b.status],
        target: `booking/${b.id}`,
      });
  }
  rows.push(...(bank.releases || []));
  const shown = rows
    .filter(
      (r) =>
        (!f.org || r.org_id === f.org) &&
        (!f.type || r.kind === f.type) &&
        (!f.date || bankDate(r.created) === f.date),
    )
    .sort((a, b) => b.created.localeCompare(a.created));
  return `<form id="bank-ledger-form" class="bank-ledger-filters">${select('org', '服务机构', [['', '全部机构'], ...bank.accounts.map((a) => [a.orgId, a.orgName])], f.org)}${select('type', '记录类型', kinds, f.type)}${field('date', '记录日期', f.date || '', 'date', false)}<div class="actions"><button class="primary" type="submit">筛选明细</button>${btn('重置', 'bank-ledger-reset', '', 'text-button')}</div></form><div class="bank-ledger-rows">${shown.map((r) => `<a class="ledger-row" href="#${esc(r.target)}"><div><b>${esc(r.orgName)}</b><p>${esc(r.note)}</p><small>${dateTime(r.created)} · ${esc(r.state)}</small></div><strong class="${r.minutes > 0 && !['hold', 'pending'].includes(r.kind) ? 'credit' : ''}">${r.minutes > 0 && ['credit', 'refund', 'correction', 'release'].includes(r.kind) ? '+' : ''}${hours(r.minutes)}<small> 小时</small><small class="bank-ledger-kind">${esc(kinds.find(([key]) => key === r.kind)?.[1])}</small></strong></a>`).join('') || empty('暂无匹配的时间记录', '调整筛选条件，或完成服务后再来查看。')}</div><p class="notice">待确认与占用不计入可用时间；释放仅解除预约占用。兑换不会减少累计志愿贡献，点击记录可查看关联服务与原因。</p>`;
}
