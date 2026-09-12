import { esc, icon, btn, link, empty, hours } from './ui.js';

const categories = {
  陪伴交流: 'companion',
  陪伴聊天: 'companion',
  陪诊协助: 'medical',
  生活协助: 'housework',
  生活帮助: 'housework',
  出行陪同: 'walk',
  上门探访: 'walk',
};
const filters = [
  ['', '全部'],
  ['draft', '草稿'],
  ['recruiting', '招募中'],
  ['active', '进行中'],
  ['completed', '已完成'],
  ['cancelled', '已取消'],
];
const groups = [
  ['applications', '待处理报名', 'red', 'people'],
  ['records', '待确认服务', 'amber', 'record'],
  ['other', '其他事项', 'blue', 'more'],
];
const confirmedStates = ['accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'];

export function requesterIcon(name) {
  const shapes = {
    people:
      '<circle cx="9" cy="6" r="4" fill="currentColor"/><path d="M2 21v-4a7 7 0 0 1 14 0v4zM16 3a4 4 0 0 1 0 8m2 2c4 0 5 3 5 6v2h-5" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    record:
      '<rect x="4" y="1" width="16" height="22" rx="3" fill="currentColor"/><path d="M8 7h8M8 12h8M8 17h5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>',
    more: '<circle cx="12" cy="12" r="11" fill="currentColor"/><g fill="white"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></g>',
    check:
      '<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m6 12 4 4 8-8" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    time: '<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 5v7l5 3" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>',
    pin: '<path d="M12 1a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8z" fill="currentColor"/><circle cx="12" cy="9" r="3" fill="white"/>',
  };
  return shapes[name]
    ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]}</svg>`
    : icon(name);
}

export function requesterDate(value, now = Date.now()) {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间待安排';
  const date = new Date(value);
  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const label =
    dayKey(value) === dayKey(now)
      ? '今日'
      : dayKey(value) === dayKey(Number(now) + 86400000)
        ? '明日'
        : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' });
  return `${label} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })}`;
}

export function requesterStatus(t) {
  const apps = t.applications || [];
  if (t.status === 'cancelled')
    return {
      group: 'cancelled',
      label: '已取消',
      color: 'gray',
      glyph: 'close',
      action: '查看详情',
      focus: 'arrangement',
    };
  if (t.status === 'draft')
    return {
      group: 'draft',
      label: '草稿',
      color: 'gray',
      glyph: 'record',
      action: '继续编辑',
      focus: 'edit',
    };
  if (apps.some((a) => a.status === 'disputed'))
    return {
      group: 'active',
      label: '有异议',
      color: 'amber',
      glyph: 'record',
      action: '处理异议',
      focus: 'disputes',
    };
  if (apps.some((a) => a.status === 'submitted'))
    return {
      group: 'active',
      label: '待核实',
      color: 'amber',
      glyph: 'record',
      action: '确认服务',
      focus: 'records',
    };
  if (
    t.displayStatus === 'completed' ||
    (apps.some((a) => a.status === 'confirmed') &&
      apps.every((a) => ['confirmed', 'withdrawn', 'rejected', 'cancelled', 'revoked'].includes(a.status)))
  )
    return {
      group: 'completed',
      label: '已完成',
      color: 'green',
      glyph: 'check',
      action: '查看记录',
      focus: 'records',
    };
  if (apps.some((a) => a.status === 'checked_in'))
    return {
      group: 'active',
      label: '服务中',
      color: 'blue',
      glyph: 'time',
      action: '查看安排',
      focus: 'arrangement',
    };
  if (t.hasPendingChange)
    return {
      group: 'active',
      label: '安排变更',
      color: 'blue',
      glyph: 'more',
      action: '查看变更',
      focus: 'other',
    };
  if (t.displayStatus === 'ended')
    return {
      group: 'active',
      label: '已结束',
      color: 'gray',
      glyph: 'time',
      action: '查看记录',
      focus: 'records',
    };
  if (t.status === 'paused')
    return {
      group: 'active',
      label: '已暂停',
      color: 'gray',
      glyph: 'time',
      action: '查看安排',
      focus: 'arrangement',
    };
  if (
    (t.remaining === 0 || Date.parse(t.deadline) <= Date.now()) &&
    apps.some((a) => a.status === 'accepted')
  )
    return {
      group: 'active',
      label: '待服务',
      color: 'blue',
      glyph: 'time',
      action: '查看安排',
      focus: 'arrangement',
    };
  return {
    group: 'recruiting',
    label: '招募中',
    color: 'red',
    glyph: 'people',
    action: '处理报名',
    focus: 'applications',
  };
}

export function requesterTodos(tasks) {
  const items = [];
  for (const task of tasks) {
    const apps = task.applications || [];
    const add = (type, count, description, updated, focus = type) =>
      items.push({ task, type, count, description, updated, focus });
    const pending = apps.filter((a) => a.status === 'pending');
    if (pending.length)
      add(
        'applications',
        pending.length,
        `${pending.length}位志愿者已报名，等待审核确认`,
        pending
          .map((a) => a.updated || a.created)
          .sort()
          .at(-1),
      );
    const records = apps.filter((a) => a.status === 'submitted');
    if (records.length)
      add(
        'records',
        records.length,
        `志愿者已提交服务记录与${hours(records.reduce((sum, a) => sum + (a.record?.submitted || 0), 0))}小时服务时长，等待核实`,
        records
          .map((a) => a.record?.updated || a.updated)
          .sort()
          .at(-1),
      );
    const disputes = apps.filter((a) => a.status === 'disputed');
    if (disputes.length)
      add(
        'other',
        disputes.length,
        `${disputes.length}份服务记录有异议，请核实处理`,
        disputes
          .map((a) => a.record?.updated || a.updated)
          .sort()
          .at(-1),
        'disputes',
      );
    const requests = apps.filter((a) => a.status === 'accepted' && a.changeRequest);
    if (task.status !== 'cancelled' && requests.length)
      add(
        'other',
        requests.length,
        '志愿者申请调整服务时间，请尽快确认',
        requests
          .map((a) => a.changeRequest.created)
          .sort()
          .at(-1),
        'changes',
      );
    const withdrawals = apps.filter((a) => a.status === 'withdrawn' && a.wasAccepted && !a.withdrawalHandled);
    if (task.status !== 'cancelled' && withdrawals.length)
      add(
        'other',
        withdrawals.length,
        '志愿者退出任务，需重新安排人员',
        withdrawals
          .map((a) => a.updated)
          .sort()
          .at(-1),
        'withdrawals',
      );
    if (task.hasPendingChange) add('other', 1, '服务安排已调整，等待志愿者确认', task.updated, 'changes');
  }
  const otherOrder = { disputes: 0, changes: 1, withdrawals: 2 };
  return items.sort(
    (a, b) =>
      groups.findIndex(([id]) => id === a.type) - groups.findIndex(([id]) => id === b.type) ||
      (a.type === 'other' ? otherOrder[a.focus] - otherOrder[b.focus] : 0) ||
      String(b.updated || '').localeCompare(String(a.updated || '')),
  );
}

function picture(t) {
  const art = categories[t.category];
  // The supplied reference is used as a CSS sprite only for its four service photos.
  // All text, counters, controls and layout remain live HTML.
  return art
    ? `<span class="requester-picture ${art}" aria-hidden="true"></span>`
    : `<span class="requester-picture fallback" aria-hidden="true"><img src="/images/hall-companion.webp" alt="" loading="lazy"></span>`;
}
function badge(label, color, glyph) {
  return `<span class="requester-badge ${color}">${requesterIcon(glyph)}${esc(label)}</span>`;
}
function taskHref(t, focus) {
  return focus === 'edit' ? `#publish/${esc(t.id)}` : `#task/${esc(t.id)}/${focus}`;
}
function publishedCard(t) {
  const s = requesterStatus(t);
  const confirmed = (t.applications || []).filter((a) => confirmedStates.includes(a.status)).length;
  const note = {
    applications: '管理报名信息',
    arrangement: '服务安排及联系信息',
    records: s.group === 'completed' ? '服务记录及评价' : '确认服务结果',
    other: '处理服务变更与异议',
    disputes: '处理服务结果异议',
    edit: '继续完善并发布需求',
  }[s.focus];
  return `<a class="requester-card published-card" href="${taskHref(t, s.focus)}" aria-label="${esc(t.title || '未命名草稿')}，${s.action}">
    ${picture(t)}<div class="requester-card-body"><h2>${esc(t.title || '未命名草稿')}</h2>
    <p class="requester-location">${requesterIcon('pin')}<span>${esc(t.region || t.orgName)}</span></p>
    <div class="requester-meta"><span>${icon('calendar')}${esc(requesterDate(t.start))}</span><span>${icon('clock')}${hours(t.minutes)}小时</span></div>
    <p class="requester-confirmed">${requesterIcon('people')}<span>已确认 <strong>${confirmed}/${t.capacity}</strong></span></p>
    <p class="requester-card-note">点击查看详情、${note}</p></div>
    <span class="requester-card-status">${badge(s.label, s.color, s.glyph)}${icon('arrow')}</span>
    <span class="requester-card-action${s.group === 'completed' ? ' outline' : ''}">${s.action}</span>
  </a>`;
}
function todoCard(item) {
  const { task: t, type, description, updated, focus } = item;
  const [, label, color, glyph] = groups.find(([id]) => id === type);
  return `<a class="requester-card todo-card" href="${taskHref(t, focus)}" aria-label="${esc(t.title)}，${esc(label)}，去处理">
    ${picture(t)}<div class="requester-card-body">${badge(type === 'other' ? '其他待处理事项' : label, color, glyph)}<h2>${esc(t.title)}</h2>
    <p class="requester-location">${requesterIcon('pin')}<span>${esc(t.region || t.orgName)}</span></p>
    <p class="requester-todo-description">${esc(description)}</p>
    <p class="requester-updated">${icon('clock')}${esc(updated ? requesterDate(updated).replace('今日', '今天').replace('明日', '明天') + ' 更新' : '待处理')}</p></div>
    <span class="requester-card-arrow">${icon('arrow')}</span><span class="requester-card-action">去处理</span>
  </a>`;
}

export function requesterHall({ tasks, todo = false, filter = '', todoFilter = '' }) {
  const items = requesterTodos(tasks);
  const counts = Object.fromEntries(
    groups.map(([id]) => [id, items.filter((i) => i.type === id).reduce((sum, i) => sum + i.count, 0)]),
  );
  const count = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const statusOrder = {
    草稿: 0,
    招募中: 1,
    待服务: 2,
    服务中: 3,
    安排变更: 3,
    待核实: 4,
    有异议: 4,
    已暂停: 5,
    已结束: 6,
    已完成: 7,
    已取消: 8,
  };
  const list = todo
    ? items.filter((i) => !todoFilter || i.type === todoFilter)
    : tasks
        .filter((t) => !filter || requesterStatus(t).group === filter)
        .sort(
          (a, b) =>
            statusOrder[requesterStatus(a).label] - statusOrder[requesterStatus(b).label] ||
            String(a.start).localeCompare(String(b.start)),
        );
  return `<header class="requester-hall-header"><h1>服务大厅</h1><p>发布身边的需要 让善意在社区相遇</p></header>
    <section class="requester-hall-sheet" aria-label="需求方服务大厅">
      <div class="requester-tabs" role="tablist" aria-label="需求管理">
      ${btn('已发布需求', 'service-tab', 'discover', `requester-tab${todo ? '' : ' active'}`, `id="requester-published-tab" role="tab" aria-selected="${!todo}" aria-controls="requester-panel"`)}
      ${btn(`待办${count ? `<span class="requester-count">${count}</span>` : ''}`, 'service-tab', 'todo', `requester-tab${todo ? ' active' : ''}`, `id="requester-todo-tab" role="tab" aria-selected="${todo}" aria-controls="requester-panel"`)}
      </div>
      ${todo ? `<div class="requester-todo-stats" aria-label="待办分类">${groups.map(([id, label, color, glyph]) => btn(`<span class="requester-stat-icon ${color}">${requesterIcon(glyph)}</span><span class="requester-stat-copy"><span>${label}</span><strong class="${color}">${counts[id]}</strong></span>`, 'requester-todo-filter', id, `requester-stat${todoFilter === id ? ' selected' : ''}`, `aria-pressed="${todoFilter === id}" aria-label="${label} ${counts[id]}项"`)).join('')}</div>` : `${link(`${icon('plus')}发布需求`, 'publish/help', 'requester-publish')}<div class="requester-filters" aria-label="需求状态">${filters.map(([id, label]) => btn(label, 'requester-status', id, `requester-filter${filter === id ? ' active' : ''}`, `aria-pressed="${filter === id}"`)).join('')}</div>`}
      <div id="requester-panel" class="requester-list" role="tabpanel" aria-labelledby="${todo ? 'requester-todo-tab' : 'requester-published-tab'}">${list.length ? list.map(todo ? todoCard : publishedCard).join('') : `<div class="requester-empty">${empty(todo ? '当前没有待处理事项' : filter ? '暂无该状态的需求' : '还没有发布需求', todo ? '新的报名、服务记录与人员变更会在这里提醒你。' : '发布一份帮扶需求，让温暖从这里开始。')}${todo ? btn('查看已发布需求', 'service-tab', 'discover', 'primary') : link('发布需求', 'publish/help', 'primary')}</div>`}</div>
    </section>`;
}
