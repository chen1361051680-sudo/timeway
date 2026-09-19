import { esc, icon, btn, link, status, dateTime, hours } from './ui.js';
import { requesterStatus } from './requester-hall.js';

const sectionTitle = (glyph, title, extra = '') =>
  `<div class="td-section-title"><h2>${icon(glyph)}${title}</h2>${extra}</div>`;
const metric = (glyph, label, value, unit) =>
  `<div>${icon(glyph)}<span>${label}</span><strong>${esc(value)}<small>${unit}</small></strong></div>`;
const row = (glyph, label, content, extra = '') =>
  `<div class="td-info-row"><span class="td-row-icon">${icon(glyph)}</span><div><span class="td-label">${label}</span>${content}</div>${extra}</div>`;

export function serviceCompletionDialog(task) {
  return `<form id="modal-form" class="service-completion-form">
    <img class="service-completion-art" src="/images/service-thanks.png" width="1536" height="1024" alt="" aria-hidden="true">
    <h2 id="dialog-title">感谢你的服务</h2>
    <p class="service-completion-message">每一份陪伴，都让社区多一份温暖</p>
    <div class="service-completion-task">${icon('heart')}<span>${esc(task.title)}</span></div>
    <p class="service-completion-note">确认后将按服务安排提交完成记录<br>服务时长经需求方核实后入账</p>
    <p class="form-error" role="alert"></p>
    <div class="service-completion-actions">${btn('取消', 'close', '', 'secondary')}<button class="primary" type="submit">确认完成</button></div>
  </form>`;
}

function volunteerContact(volunteer) {
  const phone = volunteer.phone || '';
  const callable = /^[+\d][\d\s()-]{5,29}$/.test(phone);
  return `<div class="td-volunteer-contact"><span><small>联系电话</small><strong>${esc(phone || '暂未填写')}</strong></span>${callable ? `<a class="td-call" href="tel:${esc(phone.replace(/[^+\d]/g, ''))}" aria-label="拨打${esc(volunteer.name)}的电话">${icon('phone')}一键呼叫</a>` : ''}</div>`;
}

function nextAction(t) {
  const apps = t.applications || [];
  const pending = apps.filter((a) => a.status === 'pending').length;
  const records = apps.filter((a) => a.status === 'submitted').length;
  const disputes = apps.filter((a) => a.status === 'disputed').length;
  const other = apps.filter(
    (a) => a.status === 'withdrawn' && a.wasAccepted && !a.withdrawalHandled,
  ).length;
  if (disputes)
    return {
      label: '查看异议',
      section: 'disputes',
      note: `${disputes} 份服务记录有异议`,
      sub: '请查看记录并处理核实结果',
      glyph: 'info',
    };
  if (records)
    return {
      label: '查看待核实',
      section: 'records',
      note: `${records} 份服务记录待核实`,
      sub: '核实后确认实际服务时长',
      glyph: 'clipboard',
    };
  if (t.pending)
    return {
      label: '查看变更',
      section: 'changes',
      note: '服务安排变更待确认',
      sub: '查看参与者的确认进度',
      glyph: 'calendar',
    };
  if (other)
    return {
      label: '处理事项',
      section: 'other',
      note: `${other} 项服务安排待处理`,
      sub: '查看人员退出并安排补招',
      glyph: 'calendar',
    };
  if (pending && t.status !== 'cancelled')
    return {
      label: '处理报名',
      section: 'applications',
      note: `${pending} 位志愿者等待确认`,
      sub: '确认参与人员，安排本次服务',
      glyph: 'users',
    };
  const stage = requesterStatus(t);
  if (['completed', 'cancelled'].includes(stage.group) || t.displayStatus === 'ended')
    return { label: '查看记录', section: 'management' };
  return { label: '查看报名', section: 'management' };
}

export function helpDetail(t, { changes = '', management = '', participation = '', action = '' } = {}) {
  const next = nextAction(t);
  const stage = requesterStatus(t);
  const badge = t.mine
    ? `<span class="td-status td-${stage.color}"><i></i>${esc(stage.label)}</span>`
    : status(t.application?.status || t.displayStatus || t.status);
  const confirmed = t.mine
    ? t.applications.filter((a) =>
        ['accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'].includes(a.status),
      ).length
    : Math.max(0, t.capacity - t.remaining);
  const footer = t.mine
    ? `${btn(`${icon('grid')}<span>更多</span>`, 'task-tools', t.id, 'td-more-button')}${t.status !== 'cancelled' ? link('编辑内容', 'publish/' + t.id, 'secondary') : ''}${btn(next.label, 'task-section', next.section, 'primary')}`
    : action;
  return `<section class="td-hero">
      <div class="between"><span class="td-category">${icon('heart')}${esc(t.category || '助老帮扶')}</span>${badge}</div>
      <h1>${esc(t.title)}</h1><p class="td-org">${icon('building')}${esc(t.orgName)}</p>
      <div class="td-metrics">${metric('clock', '服务时长', hours(t.minutes), '小时')}${metric('users', '需要志愿者', t.capacity, '人')}${metric('check', '已确认参与', confirmed, '人')}</div>
    </section>
    ${t.mine && next.note ? `<button type="button" class="td-attention" data-action="task-section" data-id="${next.section}"><span class="td-attention-icon">${icon(next.glyph)}</span><span><strong>${next.note}</strong><small>${next.sub}</small></span>${icon('arrow')}</button>` : ''}
    ${changes}
    ${t.cancelReason ? `<p class="td-cancel-note">${icon('info')}取消原因：${esc(t.cancelReason)}</p>` : ''}
    <section class="card td-arrangement requester-task-focus" data-task-section="arrangement" tabindex="-1">
      ${sectionTitle('calendar', '服务安排')}
      ${row('clock', '服务时间', `<strong>${dateTime(t.start)}</strong><small>预计 ${dateTime(t.end)} 结束</small>`)}
      ${row('pin', '服务地点', `<strong>${esc(t.address || t.region)}</strong>`, btn(icon('map'), 'route', t.id, 'td-map-button', 'aria-label="查看前往服务地点的路线"'))}
      ${t.contact || t.phone ? row('user', '联系人', `<div class="td-contact"><strong>${esc(t.contact || '机构联系人')}</strong>${t.phone ? `<a href="tel:${esc(t.phone)}">${esc(t.phone)}</a>` : ''}</div>`) : ''}
      <div class="td-deadline">${icon('calendar')}<span>报名截止</span><strong>${dateTime(t.deadline)}</strong></div>
    </section>
    <section class="card td-description">${sectionTitle('clipboard', '服务内容')}<p class="pre">${esc(t.description)}</p>${t.requirements ? `<div class="td-requirements"><h3>参与要求</h3><p class="pre">${esc(t.requirements)}</p></div>` : ''}</section>
    ${management}${participation}
    ${footer ? `<div class="td-footer${t.mine ? ' td-owner-footer' : ' td-volunteer-footer'}" aria-label="需求操作">${footer}</div>` : ''}`;
}

export function helpTaskTools(t) {
  const item = (glyph, title, subtitle, action, danger = false) =>
    btn(
      `<span class="td-tool-icon">${icon(glyph)}</span><span><strong>${title}</strong><small>${subtitle}</small></span>${icon('arrow')}`,
      action,
      t.id,
      `td-tool${danger ? ' td-tool-danger' : ''}`,
    );
  return `<div class="td-tools">${t.status !== 'cancelled' ? item('clock', t.status === 'published' ? '暂停招募' : '开放发布', t.status === 'published' ? '暂停接收新的报名' : '继续接收志愿者报名', t.status === 'published' ? 'pause-task' : 'publish-task') : ''}
    ${item('clipboard', '需求变更记录', '查看这项需求的操作记录', 'audit')}
    ${item('pin', '补充／更正成果地点', '核实服务成果在地图上的位置', 'location')}
    ${t.status !== 'cancelled' ? item('close', '取消需求', '填写原因并通知相关参与者', 'cancel-task', true) : ''}</div>`;
}

export function helpManagement(t, recordBlock) {
  const apps = t.applications || [];
  const other = apps.filter(
    (a) => a.status === 'withdrawn' && a.wasAccepted && !a.withdrawalHandled,
  );
  const focus = (name) =>
    `class="participant requester-task-focus" data-task-section="${name}" tabindex="-1"`;
  const order = { disputed: 0, submitted: 1, pending: 2, checked_in: 3, accepted: 4, confirmed: 5 };
  const sorted = [...apps].sort((a, b) => (order[a.status] ?? 6) - (order[b.status] ?? 6));
  return `${other.length ? `<section class="card td-management" data-task-section="other" tabindex="-1">${sectionTitle('info', '安排待处理', `<span class="td-count">${other.length}</span>`)}${other.map((a) => `<article ${focus('withdrawals')}><h3>${esc(a.volunteer.name)} · 已退出任务</h3><p>${esc(a.reason)}</p><p>当前已确认 ${t.capacity - t.remaining}/${t.capacity} 人，请安排补招。</p><div class="actions">${link('调整需求安排', 'publish/' + t.id)}${btn('记录处理结果', 'handle-withdrawal', a.id, 'primary')}</div></article>`).join('')}</section>` : ''}
    <section class="card td-management requester-task-focus" data-task-section="management" tabindex="-1">${sectionTitle('users', '报名与服务', apps.length ? `<span class="td-count">${apps.length} 人报名</span>` : '')}
      ${sorted.length ? sorted.map((a) => `<article ${focus(a.status === 'pending' ? 'applications' : a.status === 'disputed' ? 'disputes' : 'records')}><div class="td-person"><span class="td-avatar" aria-hidden="true">${esc(Array.from(a.volunteer.name || '志')[0])}</span><div><h3>${esc(a.volunteer.name)}</h3>${a.volunteer.skills ? `<p>${esc(a.volunteer.skills)}</p>` : ''}</div>${status(a.status)}</div>${volunteerContact(a.volunteer)}${a.message ? `<p class="td-person-message">${esc(a.message)}</p>` : ''}${a.reason ? `<p>${esc(a.reason)}</p>` : ''}${a.status === 'pending' ? `<div class="actions td-person-actions">${btn('不通过', 'reject-app', a.id)}${btn('确认参与', 'accept-app', a.id, 'primary')}</div>` : ''}${a.withdrawalHandled ? `<p>退出处理：${esc(a.withdrawalHandled.reason)}</p>` : ''}${recordBlock(a.record, true)}</article>`).join('') : `<div class="td-empty">${icon('users')}<div><strong>等待志愿者报名</strong><p>收到报名后，可在这里确认参与人员</p></div></div>`}
    </section>`;
}
