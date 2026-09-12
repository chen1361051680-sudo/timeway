import { baiduMap } from './baidu-map.js';
import { requestId } from './request-id.js';
import { locationAccessMessage } from './location-access.js';
import { mapSheet } from './map-sheet.js';
import { mapContent, availableNeeds } from './map-ui.js';
import {
  esc,
  icon,
  navIcon,
  dateTime,
  localTime,
  hours,
  status,
  labels,
  btn,
  link,
  empty,
  field,
  select,
  categories,
  taskCard,
  bookingCard,
} from './ui.js';
import { hallContent, hallCategories } from './hall.js';
import { requesterHall } from './requester-hall.js';
import { requesterBank, requesterProfile } from './requester-account.js';
import { volunteerProfile, profileEditor, accountSettings } from './profile.js';
import { bankContent, bankAccount, bankLedger } from './bank.js';
import { newPublication, publishForm, syncPublication, publicationData, validatePublication, publicationPreview } from './publish.js';
import { choosePlace, mountPlacePreview } from './place-picker.js';

const root = document.querySelector('#app'),
  dialog = document.querySelector('#dialog');
const state = {
  user: null,
  csrf: null,
  config: null,
  tab: 'discover',
  bankTab: 'offers',
  bankFilter: {},
  bankInitialized: false,
  bankLedgerFilter: {},
  filter: {},
  requesterStatus: '',
  requesterTodoFilter: '',
  requesterBankFilter: {},
  requesterBookingWorkOnly: false,
  mapScope: 'all',
  city: null,
  mapRegion: null,
  mapLocating: false,
  mapAutoLocateAttempted: false,
  showNeeds: true,
  collapsed: false,
  scroll: new Map(),
};
let renderToken = 0,
  dirty = false,
  toastTimer,
  modalSubmit,
  lastRoute = location.hash || '#map';
const requester = () => state.user?.role === 'requester';
const current = () => location.hash.slice(1) || 'map';
const go = (to) => {
  location.hash = to;
};
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 4500);
}
async function api(path, method = 'GET', body, idempotencyKey) {
  if (body) {
    body = { ...body };
    for (const key of ['start', 'end', 'deadline'])
      if (body[key]) {
        const value = new Date(body[key]);
        if (Number.isNaN(value.getTime())) throw new Error('请填写有效的日期和时间');
        body[key] = value.toISOString();
      }
  }
  const response = await fetch('/api' + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.csrf ? { 'X-CSRF-Token': state.csrf } : {}),
      ...(body && method !== 'GET' ? { 'Idempotency-Key': idempotencyKey || requestId() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      state.user = null;
      go('login');
    }
    throw new Error(result.error || '请求失败，请重试');
  }
  return result;
}
function tabs(items, active, action) {
  return `<div class="tabs" role="tablist">${items.map(([id, title]) => btn(esc(title), action, id, active === id ? 'tab active' : 'tab', `role="tab" aria-selected="${active === id}"`)).join('')}</div>`;
}
function header(title, back = false) {
  return `<header class="page-head">${back ? btn(icon('back'), 'back', '', 'icon-button', 'aria-label="返回"') : ''}<h1>${esc(title)}</h1></header>`;
}
function shell(content, tab = 'map', title = '', back = false, variant = '') {
  document.documentElement.classList.toggle('large-text', state.user?.settings?.fontSize === 'large');
  return `<div class="app-shell ${variant}">${state.config?.environment !== 'production' && !variant && !requester() ? '<div class="dev-banner">模拟体验 · 当前使用模拟账号 · 数据与生产隔离</div>' : ''}${title ? header(title, back) : ''}<main>${content}</main><nav class="bottom-nav" aria-label="主导航">${[
    ['map', 'map', '爱心地图'],
    ['services', 'grid', '服务大厅'],
    ['bank', 'clock', '时间银行'],
    ['profile', 'user', '我的'],
  ]
    .map(
      ([id, i, label]) =>
        `<a href="#${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="page"' : ''}>${navIcon(i)}<span>${label}</span></a>`,
    )
    .join('')}</nav></div>`;
}
function modal(title, html, onSubmit, label = '确认', accountStyle = false) {
  if (!mayDiscardProfileForm()) return;
  dialog.classList.remove('login-dialog');
  dialog.classList.toggle('account-dialog', accountStyle);
  dialog.classList.toggle('profile-editor-dialog', accountStyle && title === '编辑资料');
  dialog.classList.toggle('account-settings-dialog', accountStyle && title === '设置');
  dialog.innerHTML = `<div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>${btn(icon('close'), 'close', '', 'icon-button', 'aria-label="关闭弹窗"')}</div>${onSubmit ? `<form id="modal-form">${accountStyle ? '<div class="account-body">' + html + '</div><div class="account-footer">' : html}<p class="form-error" role="alert"></p><button class="primary wide" type="submit">${esc(label)}</button>${accountStyle ? '</div>' : ''}</form>` : html}`;
  modalSubmit = onSubmit;
  const guarded = accountStyle || ['维护资料', '账户与显示设置'].includes(title);
  dialog.dataset.profileSnapshot = guarded ? JSON.stringify(formData(dialog.querySelector('form'))) : '';
  if (!dialog.open) dialog.showModal();
}
function profileFormChanged() {
  const form = dialog.querySelector('form');
  return (
    dialog.open &&
    dialog.dataset.profileSnapshot &&
    form &&
    dialog.dataset.profileSnapshot !== JSON.stringify(formData(form))
  );
}
function mayDiscardProfileForm() {
  return !profileFormChanged() || confirm('当前修改尚未保存，确认放弃修改？');
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}
function errorIn(form, error) {
  const node = form.querySelector('.form-error');
  if (node) node.textContent = error.message;
  else toast(error.message);
}
async function mutate(path, body, method = 'POST') {
  const result = await api(path, method, body);
  dialog.close();
  toast('已保存');
  await render();
  return result;
}
const reason = (title, path, action, extra = {}) =>
  modal(title, field('reason', '请填写原因', '', 'textarea'), (b) =>
    mutate(path, { ...extra, ...b, action }),
  );
function summary(s) {
  return `<div class="stats">${btn(`<strong>${s.places}</strong><span>已点亮地点</span>`, 'footprints', '', 'stat')}${btn(`<strong>${s.services}</strong><span>完成服务</span>`, 'history', '', 'stat')}${link(`<strong>${hours(s.minutes)}</strong><span>贡献小时</span>`, 'bank', 'stat')}</div>`;
}
function login() {
  return `<main class="login-page" aria-labelledby="login-title">
    <header class="login-brand">
      <img class="login-logo" src="/login-logo.webp" alt="时光有路 Logo" width="1374" height="1145" fetchpriority="high">
      <h1 id="login-title">时光有路</h1>
      <p>用时间连接更温暖的社区</p>
    </header>
    <div class="login-entries" aria-label="选择登录身份">
      ${btn(`<span class="login-entry-icon">${icon('user-filled')}</span><span class="login-entry-label">志愿者登录</span>${icon('arrow')}`, 'login-role', 'volunteer', 'login-entry login-entry-volunteer', 'aria-label="志愿者登录"')}
      ${btn(`<span class="login-entry-icon">${icon('users-filled')}</span><span class="login-entry-label">需求方登录<small>（社区、机构等）</small></span>${icon('arrow')}`, 'login-role', 'requester', 'login-entry login-entry-requester', 'aria-label="需求方登录（社区、机构等）"')}
    </div>
  </main>`;
}
function loginForm(role) {
  const title = role === 'requester' ? '需求方登录' : '志愿者登录';
  const demo = state.config?.demoAccounts?.[role];
  if (!demo) return modal(title, '<p class="notice">当前环境不开放模拟账号登录。</p>');
  modal(
    title,
    `<form id="login-form" class="login-form">
    <div class="login-welcome">
      <img src="${role === 'requester' ? '/requester-logo.webp' : '/login-logo.webp'}" width="${role === 'requester' ? '1254' : '1374'}" height="${role === 'requester' ? '1254' : '1145'}" alt="${role === 'requester' ? '伸出手掌与爱心对话气泡，表达需要帮助' : ''}">
      <h3>${role === 'volunteer' ? '把时间，变成温暖' : '让善意，在这里相遇'}</h3>
      <p>${role === 'volunteer' ? '从一次陪伴开始，留下你的爱心足迹' : '连接社区需求，让每一份帮助有所归处'}</p>
    </div>
    <p class="login-help">为方便使用，请提供一键登录按钮及模拟账号登录。请点击下方登录按钮正常使用。</p>
    <input type="hidden" name="role" value="${role}">
    <p class="form-error" role="alert"></p>
    <button type="submit" class="login-submit" aria-label="一键快速登录（模拟账号）"><span>一键快速登录<small>（模拟账号）</small></span>${icon('arrow')}</button>
    <p class="login-signoff">时光有路 · 用时间连接更温暖的社区</p>
  </form>`,
  );
  dialog.classList.add('login-dialog');
}
function termsContent() {
  return `<p>时光有路连接社区助老需求与志愿者。当前仅有需求方和志愿者两个身份。</p><p>当前使用模拟账号登录。个人资料、联系信息和服务材料仅供相关参与者处理本次服务。公共成果只展示概略区域与匿名统计。</p><p>时间权益来自机构核实的实际服务，不是现金，按发放机构分别兑换。未提供的兑换服务取消后释放占用，争议由双方通过关联记录沟通并核实。</p><p>请取得受助者同意，避免上传不必要的身份、医疗或其他敏感材料。可通过任务留言申请资料更正，个人资料可在“我的”维护。</p><p>地图、短信、文件存储的真实接入以当前环境说明为准。</p>`;
}
function profileFields() {
  const u = state.user;
  return `${field('name', requester() ? '机构名称' : '姓名', u.name, 'text', true, 'maxlength="80"')}${field('contactPhone', '联系电话', u.contactPhone || u.phone, 'tel', true, 'maxlength="30"')}${field('region', '常用服务区域', u.region, 'text', true, 'maxlength="100"')}${requester() ? field('contact', '机构联系人', u.contact) + field('address', '机构地址', u.address) : field('skills', '擅长服务', u.skills, 'textarea', false, 'maxlength="200"')}<p class="muted">账号手机号：${esc(u.phone)} · 身份：${requester() ? '需求方' : '志愿者'}</p>`;
}
function completeProfile() {
  return `<main class="setup-page"><h1>完善${requester() ? '机构' : '个人'}资料</h1><p>让${requester() ? '志愿者认识你的机构' : '社区了解你的服务意愿'}。</p><form id="profile-form" class="card">${profileFields()}<p class="form-error" role="alert"></p><button class="primary wide">保存并进入</button></form></main>`;
}

async function mapPage() {
  if (state.city === null)
    state.city = state.user.region?.match(/^(.+?市|杭州|上海|北京|广州|深圳|成都|南京|苏州)/)?.[0] || '';
  const [data, tasks, ownTasks] = await Promise.all([
    api('/map?scope=' + state.mapScope),
    api(
      '/tasks?' +
        new URLSearchParams({ kind: 'help', ...state.filter, ...(requester() ? { scope: 'mine' } : {}) }),
    ),
    api('/tasks?kind=help&scope=mine'),
  ]);
  state.mapData = data;
  const matchesRegion = (region) => {
    if (state.mapRegion?.query === state.city) {
      const { city, district } = state.mapRegion;
      return (!city || region.includes(city)) && (!district || region.includes(district));
    }
    return !state.city || region.includes(state.city);
  };
  const shown = tasks.filter((t) => matchesRegion(t.region));
  const cells = data.cells.filter((c) => matchesRegion(c.region));
  state.cells = cells;
  state.mapNeeds = availableNeeds(shown);
  state.mapOwn = ownTasks;
  const todo = ownTasks.filter(
    (t) =>
      t.newApplicants ||
      t.hasPendingChange ||
      t.applications.some((a) => ['submitted', 'disputed'].includes(a.status)),
  );
  const ongoing = ownTasks
    .filter((t) => ['accepted', 'checked_in', 'submitted', 'disputed'].includes(t.application?.status))
    .sort((a, b) =>
      a.application.status === 'checked_in'
        ? -1
        : b.application.status === 'checked_in'
          ? 1
          : a.start.localeCompare(b.start),
    );
  const actions = requester() ? todo : [...ongoing, ...state.mapNeeds];
  const selected = [...state.mapNeeds, ...ownTasks].find((t) => t.id === state.selectedTask);
  if (!selected) state.selectedTask = null;
  if (!cells.some((c) => c.cell === state.selectedCell)) state.selectedCell = null;
  const action = selected || actions[0];
  return shell(
    mapContent({
      state,
      data,
      needs: state.mapNeeds,
      cells,
      action,
      pending: todo.reduce(
        (n, t) =>
          n +
          t.newApplicants +
          Number(t.hasPendingChange) +
          t.applications.filter((a) => ['submitted', 'disputed'].includes(a.status)).length,
        0,
      ),
    }),
    'map',
    '',
    false,
    'map-shell',
  );
}

function filters(extra = '') {
  const f = state.filter;
  return `<form id="filter-form" class="filters"><div class="search-row">${field('q', '搜索需求、机构或区域', f.q || '', 'search', false)}<button class="icon-button" aria-label="搜索">${icon('search')}</button></div><details class="filter-options"><summary>类型、日期与时长筛选</summary><div class="filter-grid">${select('category', '服务类型', [['', '全部类型'], ...categories], f.category)}${field('date', '预约日期', f.date || '', 'date', false)}${select(
    'minutes',
    '服务时长',
    [
      ['', '不限时长'],
      ['30', '30 分钟以内'],
      ['60', '60 分钟以内'],
      ['90', '90 分钟以内'],
      ['180', '3 小时以内'],
    ],
    f.minutes,
  )}${extra}</div></details><div class="between"><small>路线待接入，暂按开始时间排序</small>${btn('重置', 'reset-filter', '', 'text-button')}<button class="text-button">应用筛选</button></div></form>`;
}
async function servicesPage() {
  if (!requester()) {
    const mine = state.tab === 'mine';
    const query = new URLSearchParams({
      kind: 'help',
      sort: 'distance',
      ...state.filter,
      ...(mine ? { scope: 'mine' } : { available: '1' }),
    });
    const [listed, own] = await Promise.all([api('/tasks?' + query), api('/tasks?kind=help&scope=mine')]);
    state.ownServices = own;
    const tasks = state.filter.status ? listed.filter((t) => matchesStatus(t, state.filter.status)) : listed;
    state.list = tasks;
    return shell(
      hallContent({
        tasks,
        own,
        filter: state.filter,
        mine,
        environment: state.config?.environment,
      }),
      'services',
      '',
      false,
      'volunteer-hall',
    );
  }
  const tasks = await api('/tasks?kind=help&scope=mine');
  state.list = tasks;
  return shell(
    requesterHall({
      tasks,
      todo: state.tab === 'todo',
      filter: state.requesterStatus,
      todoFilter: state.requesterTodoFilter,
    }),
    'services',
    '',
    false,
    'requester-hall',
  );
}
function matchesStatus(t, s) {
  const a = t.application;
  if (s === 'draft') return t.status === 'draft';
  if (s === 'pending')
    return (
      t.hasPendingChange ||
      (a
        ? ['pending', 'submitted', 'disputed'].includes(a.status)
        : t.status === 'published' && t.newApplicants > 0)
    );
  if (s === 'active')
    return a
      ? ['accepted', 'checked_in'].includes(a.status)
      : t.applications.some((a) => ['accepted', 'checked_in', 'submitted'].includes(a.status));
  if (s === 'completed')
    return a
      ? a.status === 'confirmed'
      : t.applications.length > 0 &&
          t.applications.every((a) =>
            ['confirmed', 'rejected', 'withdrawn', 'cancelled', 'revoked'].includes(a.status),
          );
  if (s === 'other')
    return (
      ['paused', 'cancelled'].includes(t.status) ||
      ['withdrawn', 'rejected', 'cancelled', 'revoked'].includes(a?.status)
    );
  return true;
}
function recordBlock(r, org) {
  if (!r) return '';
  return `<div class="record-block requester-task-focus" data-record-id="${esc(r.id)}" tabindex="-1"><div class="between"><h3>服务核实记录</h3>${status(r.status)}</div><p>${dateTime(r.start)} — ${dateTime(r.end)}</p><p class="pre">${esc(r.content)}</p><p>提交 ${r.submitted} 分钟 · 已确认 ${r.confirmed} 分钟 · ${r.recipients || 0} 受助人次</p>${r.note ? `<p>人工说明：${esc(r.note)}</p>` : ''}${r.reason ? `<p>核实说明：${esc(r.reason)}</p>` : ''}${r.dispute ? `<p class="notice">异议：${esc(r.dispute)}</p>` : ''}<div class="actions">${org ? (r.status === 'submitted' ? btn('核实服务', 'confirm-record', r.id, 'primary') : r.status === 'disputed' ? btn('处理异议', 'resolve-record', r.id, 'primary') : btn('更正记录', 'correct-record', r.id)) + (['confirmed', 'disputed'].includes(r.status) ? btn('撤销无效记录', 'revoke-record', r.id, 'text-button') : '') : r.status !== 'disputed' ? btn('对结果有异议', 'dispute-record', r.id) : ''}${btn('查看变更记录', 'audit', r.id, 'text-button')}</div></div>`;
}
function changeBlock(t, a) {
  if (!t.pending) return '';
  const p = t.pending.proposed;
  return `<section class="card notice requester-task-focus" data-task-section="changes" tabindex="-1"><h3>服务安排变更待确认</h3><p>${esc(p.title)} · ${dateTime(p.start)} — ${dateTime(p.end)}</p><p>${esc(p.address)} · ${p.minutes} 分钟</p><p class="pre">${esc(p.description)}</p>${t.mine ? `<p>${Object.values(t.pending.answers).filter((x) => x === 'pending').length} 人尚未确认；全部处理后新安排生效。</p>` : a && t.pending.answers[a.id] === 'pending' ? `<div class="actions">${btn('接受新安排', 'accept-change', a.id, 'primary')}${btn('不同意并退出', 'decline-change', a.id)}</div>` : '<p>已记录你的选择，等待其他参与者确认。</p>'}</section>`;
}
function requesterManagement(t) {
  const other = t.applications.filter(
    (a) =>
      (a.changeRequest && a.status === 'accepted') ||
      (a.status === 'withdrawn' && a.wasAccepted && !a.withdrawalHandled),
  );
  const focus = (name) =>
    `class="participant requester-task-focus" data-task-section="${name}" tabindex="-1"`;
  return `${other.length ? `<section class="card" data-task-section="other" tabindex="-1"><h2>其他待处理事项</h2>${other.map((a) => (a.changeRequest ? `<article ${focus('changes')}><h3>${esc(a.volunteer.name)} · 申请调整时间</h3><p>原时间：${dateTime(t.start)} — ${dateTime(t.end)}</p><p>建议时间：${dateTime(a.changeRequest.start)} — ${dateTime(a.changeRequest.end)}</p><p>${esc(a.changeRequest.reason)}</p><div class="actions">${btn('同意调整', 'accept-request-change', a.id, 'primary')}${btn('不通过', 'reject-request-change', a.id)}</div></article>` : `<article ${focus('withdrawals')}><h3>${esc(a.volunteer.name)} · 已退出任务</h3><p>${esc(a.reason)}</p><p>当前已确认 ${t.capacity - t.remaining}/${t.capacity} 人，请联系相关人员并安排补招。</p><div class="actions">${link('调整需求安排', 'publish/' + t.id)}${btn('记录处理结果', 'handle-withdrawal', a.id, 'primary')}</div></article>`)).join('')}</section>` : ''}
  <section class="card requester-task-focus" data-task-section="management" tabindex="-1"><h2>报名与服务管理</h2>${t.applications.length ? t.applications.map((a) => `<article ${focus(a.status === 'pending' ? 'applications' : a.status === 'disputed' ? 'disputes' : 'records')}><div class="between"><h3>${esc(a.volunteer.name)}</h3>${status(a.status)}</div><p>${esc(a.volunteer.skills || '未填写擅长服务')}</p><p>${esc(a.message || '无报名留言')}</p>${a.reason ? `<p>${esc(a.reason)}</p>` : ''}${a.status === 'pending' ? `<div class="actions">${btn('确认参与', 'accept-app', a.id, 'primary')}${btn('不通过', 'reject-app', a.id)}</div>` : ''}${a.withdrawalHandled ? `<p>退出处理：${esc(a.withdrawalHandled.reason)}</p>` : ''}${a.changeResolution ? `<p>时间调整：${a.changeResolution.action === 'accept-request-change' ? '已同意' : '未通过'} ${esc(a.changeResolution.reason)}</p>` : ''}${recordBlock(a.record, true)}</article>`).join('') : empty('暂时没有人报名', '发布后可在这里确认参与人员。')}</section>`;
}
function focusTaskSection() {
  const [page, , section, recordId] = current().split('/');
  if (
    page !== 'task' ||
    !['applications', 'arrangement', 'records', 'other', 'disputes', 'changes', 'withdrawals'].includes(
      section,
    )
  )
    return;
  const exactRecord = recordId
    ? [...root.querySelectorAll('[data-record-id]')].find((el) => el.dataset.recordId === recordId)
    : null;
  const element = exactRecord ||
    (section === 'records'
      ? root.querySelector('[data-task-section="records"]:has([data-action="confirm-record"])')
      : null) ||
    root.querySelector(`[data-task-section="${section}"]`) ||
    root.querySelector('[data-task-section="management"]');
  if (element) {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'start' });
  }
}
async function taskPage(id) {
  const t = await api('/tasks/' + id);
  state.task = t;
  state.records = Object.fromEntries(
    t.applications.filter((a) => a.record).map((a) => [a.record.id, a.record]),
  );
  if (t.application?.record) state.records[t.application.record.id] = t.application.record;
  const a = t.application;
  let action = '';
  if (t.mine) {
    action = `${t.status !== 'cancelled' ? link('编辑内容', 'publish/' + t.id) + btn(t.status === 'published' ? '暂停招募' : '开放发布', t.status === 'published' ? 'pause-task' : 'publish-task', id) : ''}${btn('复制为草稿', 'copy-task', id)}${t.status !== 'cancelled' ? btn('取消需求', 'cancel-task', id, 'text-button') : ''}${btn('补充／更正成果地点', 'location', id, 'text-button')}`;
  } else if (!requester() && t.kind === 'help') {
    action =
      !a || ['withdrawn', 'rejected'].includes(a.status)
        ? btn(
            t.remaining ? '报名参与' : '名额已满',
            'apply',
            id,
            'primary',
            t.remaining && t.status === 'published' ? '' : 'disabled',
          )
        : (['pending', 'accepted'].includes(a.status) ? btn('退出报名', 'withdraw', a.id) : '') +
          (['accepted', 'checked_in', 'disputed'].includes(a.status) ||
          (a.status === 'cancelled' && a.wasAccepted)
            ? (a.status === 'accepted'
                ? btn('到场签到', 'checkin', a.id, 'primary') +
                  (!a.changeRequest && !t.pending ? btn('申请调整时间', 'request-time-change', a.id) : '')
                : '') + btn('提交服务记录', 'submit-record', a.id, 'primary')
            : '');
  } else if (!requester() && t.kind === 'redeem') {
    const bank = await api('/bank');
    const account = bank.accounts.find((a) => a.orgId === t.owner);
    const existing = bank.bookings.find(
      (b) => b.taskId === id && !['cancelled', 'rejected', 'completed'].includes(b.status),
    );
    const blocked =
      t.remaining <= 0
        ? '名额已满'
        : t.status !== 'published' || t.hasPendingChange
          ? '暂不可预约'
          : Date.parse(t.deadline) <= Date.now() || Date.parse(t.start) <= Date.now()
            ? '预约已截止'
            : (account?.available || 0) < t.minutes
              ? '对应机构可用时间不足'
              : '';
    action =
      `<p>本机构可用 ${hours(account?.available)} 小时 · 兑换需要 ${hours(t.minutes)} 小时</p>` +
      (existing
        ? link('查看我的兑换安排', `booking/${existing.id}`, 'primary')
        : btn(blocked || '申请兑换', 'book', id, 'primary', blocked ? 'disabled' : ''));
  }
  return shell(
    `<section class="card task-hero"><div class="between"><span class="eyebrow">${t.kind === 'help' ? '助老帮扶' : '时间兑换'}</span>${status(a?.status || t.displayStatus || t.status)}</div><h1>${esc(t.title || '未命名草稿')}</h1><p>${esc(t.orgName)} · ${esc(t.category)}</p><div class="chips"><span>${hours(t.minutes)} 小时</span><span>剩余 ${t.remaining} / ${t.capacity} 名额</span></div></section>${changeBlock(t, a)}<section class="card requester-task-focus" data-task-section="arrangement" tabindex="-1"><h2>服务安排</h2><dl><dt>预约时间</dt><dd>${dateTime(t.start)} — ${dateTime(t.end)}</dd><dt>报名截止</dt><dd>${dateTime(t.deadline)}</dd><dt>服务区域</dt><dd>${esc(t.region)}</dd><dt>详细地址</dt><dd>${esc(t.address || '确认参与后向相关人员展示')}</dd>${t.meeting ? `<dt>集合说明</dt><dd>${esc(t.meeting)}</dd>` : ''}${t.contact ? `<dt>联系机构</dt><dd>${esc(t.contact)} · <a href="tel:${esc(t.phone)}">${esc(t.phone)}</a></dd>` : ''}</dl><div class="actions">${btn('查看到达说明', 'route', id)}${btn('在爱心地图查看', 'view-map', id, 'text-button')}</div></section><section class="card"><h2>需要做什么</h2><p class="pre">${esc(t.description || '暂无说明')}</p><h3>服务要求</h3><p class="pre">${esc(t.requirements || '愿意耐心陪伴，按约定时间参加。')}</p>${t.recipient ? `<h3>受助对象</h3><p>${esc(t.recipient)} · 预计 ${t.recipients} 人次</p>` : ''}${t.cancelReason ? `<p class="notice">取消原因：${esc(t.cancelReason)}</p>` : ''}</section>${t.mine && t.kind === 'help' ? requesterManagement(t) : ''}${a ? `<section class="card"><h2>我的参与</h2>${status(a.status)}${a.changeRequest ? `<p class="notice">时间调整申请已提交，等待需求方确认：${dateTime(a.changeRequest.start)} — ${dateTime(a.changeRequest.end)}</p>` : ''}${a.changeResolution ? `<p>时间调整${a.changeResolution.action === 'accept-request-change' ? '已同意' : '未通过'}：${esc(a.changeResolution.reason)}</p>` : ''}${a.reason ? `<p>${esc(a.reason)}</p>` : ''}${recordBlock(a.record, false)}</section>` : ''}${t.mine && t.kind === 'redeem' ? `<section class="card"><h2>兑换预约</h2>${t.bookings.length ? t.bookings.map(bookingCard).join('') : empty('暂无兑换预约')}</section>` : ''}${t.mine || (a && (['accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'].includes(a.status) || a.wasAccepted)) ? `<section class="card"><h2>与本次服务有关</h2><div class="actions">${btn('留言与评价', 'comments', id)}${btn('服务材料', 'files', id)}${t.mine ? btn('需求变更记录', 'audit', id) : ''}</div></section>` : ''}<div class="sticky-actions actions">${action || '<p>当前状态无待执行操作</p>'}</div>`,
    t.kind === 'redeem' ? 'bank' : 'services',
    t.kind === 'redeem' ? '兑换服务详情' : '帮扶需求详情',
    true,
  );
}
async function publishPage(id) {
  if (!requester()) throw new Error('仅需求方可以发布服务');
  const old = !['help', 'redeem'].includes(id) ? await api('/tasks/' + id) : null;
  state.editTask = old;
  const t = old || newPublication(id || 'help', state.user);
  return shell(publishForm(t, state.user, old), t.kind === 'redeem' ? 'bank' : 'services', old ? '编辑服务' : t.kind === 'redeem' ? '发布兑换服务' : '发布需求', true, 'publish-shell');
}
let publicationAttempt;
async function savePublication(mode) {
  const form=root.querySelector('#publish-form');
  if (!form || form.dataset.saving) return;
  if (mode !== 'draft' && !validatePublication(form,state.editTask)) return;
  const old=state.editTask;
  const body={...publicationData(form), kind:old?.kind || current().split('/')[1] || 'help', status:old && old.status !== 'draft' ? old.status : mode, revision:old?.revision};
  const fingerprint=JSON.stringify(body);
  if (publicationAttempt?.fingerprint !== fingerprint) publicationAttempt={fingerprint,key:requestId()};
  form.dataset.saving='1';
  try {
    const result=await api('/tasks'+(old ? '/'+old.id : ''),old ? 'PUT' : 'POST',body,publicationAttempt.key);
    publicationAttempt=null; dirty=false; dialog.close();
    go('task/'+result.id);
    toast(result.hasPendingChange ? '已通知参与者确认安排变更' : mode === 'draft' ? '草稿已保存，可稍后继续编辑' : '服务内容已保存');
  } finally { delete form.dataset.saving; }
}
function previewPublication() {
  const form=root.querySelector('#publish-form');
  if (!form || !validatePublication(form,state.editTask)) return;
  const b={...publicationData(form),kind:state.editTask?.kind || current().split('/')[1]};
  modal('发布前预览',publicationPreview(b,state.user,state.editTask),()=>savePublication('published'),state.editTask && state.editTask.status !== 'draft' ? '确认保存修改' : '确认发布');
}

async function openBankLedger() {
  const [bank, records] = await Promise.all([api('/bank'), api('/records')]);
  state.bank = bank;
  modal('收支明细', bankLedger(bank, records, state.bankLedgerFilter));
}
async function bankPage() {
  if (!requester()) {
    const [bank, offers] = await Promise.all([api('/bank'), api('/tasks?kind=redeem')]);
    state.bank = bank;
    if (!state.bankInitialized) {
      state.bankFilter = {
        org: bank.accounts.find((a) => a.contributed || a.pending || a.held)?.orgId || '',
      };
      state.bankInitialized = true;
    }
    const showLedger = state.bankTab === 'ledger';
    if (showLedger) state.bankTab = 'offers';
    const html = shell(
      bankContent({
        bank,
        offers,
        filter: state.bankFilter,
        tab: state.bankTab,
        bookingStatus: state.bookingStatus,
      }),
      'bank',
      '',
      false,
      'volunteer-bank',
    );
    if (showLedger) {
      state.bankLedgerFilter = { type: state.ledgerType || 'credit' };
      await openBankLedger();
    }
    return html;
  }
  const [bank, tasks] = await Promise.all([api('/bank'), api('/tasks?scope=mine')]);
  state.bank = bank;
  state.requesterBankTasks = tasks;
  const tab = ['ledger', 'offers', 'bookings'].includes(state.bankTab) ? state.bankTab : 'ledger';
  return shell(requesterBank({ user: state.user, bank, tasks, tab, filter: state.requesterBankFilter, bookingStatus: state.bookingStatus, bookingWorkOnly: state.requesterBookingWorkOnly }), 'bank', '', false, 'requester-bank');
}
async function bookingPage(id) {
  const b = await api('/bookings/' + id);
  state.booking = b;
  const org = requester();
  let actions = '';
  if (b.status === 'pending' && org) actions += btn('接受预约', 'accept-booking', id, 'primary');
  if (['pending', 'accepted'].includes(b.status))
    actions += btn('申请改约', 'reschedule', id) + btn('取消预约', 'cancel-booking', id);
  if (b.status === 'reschedule' && b.change.by !== state.user.id)
    actions +=
      btn('接受改约', 'accept-reschedule', id, 'primary') + btn('不同意改约', 'decline-reschedule', id);
  if (['accepted', 'disputed'].includes(b.status) && org)
    actions += btn('记录实际履约', 'booking-result', id, 'primary');
  if (b.status === 'accepted' && org) actions += btn('协商追加服务', 'extra', id);
  if (b.extra && !org)
    actions += btn('同意追加', 'accept-extra', id, 'primary') + btn('拒绝追加', 'decline-extra', id);
  if (b.status === 'result_pending' && !org)
    actions +=
      btn('确认实际结果', 'complete-booking', id, 'primary') + btn('提出异议', 'dispute-booking', id);
  if (b.status === 'completed' && !b.correction) actions += btn('申请更正扣除', 'booking-correction', id);
  if (b.correction && b.correction.by !== state.user.id)
    actions +=
      btn('接受更正', 'accept-correction', id, 'primary') + btn('拒绝更正', 'decline-correction', id);
  if (b.task.pending?.answers[id] === 'pending' && !org)
    actions +=
      btn('同意项目变更', 'accept-booking-change', id, 'primary') +
      btn('不同意并取消', 'decline-booking-change', id);
  return shell(
    `<section class="card"><div class="between"><span class="eyebrow">兑换预约</span>${status(b.status)}</div><h1>${esc(b.title)}</h1><p>${esc(b.orgName)} · 申请人 ${esc(b.applicant)}</p><h2>${dateTime(b.start)} — ${dateTime(b.end)}</h2><p>${esc(b.address)}</p><p>受助对象：${esc(b.recipient)} · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></p><p class="pre">${esc(b.needs || '暂无特殊需要')}</p><p>占用 ${b.held} 分钟 · 实际扣除 ${b.charged} 分钟</p>${link('查看项目内容', 'task/' + b.taskId, 'text-button')}</section>${b.task.pending ? changeBlock(b.task) : ''}${b.change ? `<section class="card notice"><h3>改约等待另一方确认</h3><p>${dateTime(b.change.start)} — ${dateTime(b.change.end)}</p><p>${esc(b.change.reason)}</p></section>` : ''}${b.extra ? `<section class="card notice"><h3>追加 ${b.extra.minutes} 分钟待确认</h3><p>${esc(b.extra.reason)}</p></section>` : ''}${b.result ? `<section class="card"><h2>实际履约结果</h2><p>${esc(b.result.content)}</p><p>实际 ${b.result.minutes} 分钟 · ${b.result.recipients} 受助人次</p><p class="muted">申请人确认后结算实际时长，剩余占用自动释放。</p></section>` : ''}${b.dispute || b.reason ? `<section class="card notice">${esc(b.dispute || b.reason)}</section>` : ''}${b.correction ? `<section class="card notice"><h3>扣除更正为 ${b.correction.minutes} 分钟</h3><p>${esc(b.correction.reason)}</p></section>` : ''}<section class="card"><div class="actions">${btn('留言与评价', 'comments', id)}${btn('服务材料', 'files', id)}${btn('变更记录', 'audit', id)}</div></section><div class="sticky-actions actions">${actions || '<p>暂无待执行操作，可通过留言联系对方。</p>'}</div>`,
    'bank',
    '兑换预约详情',
    true,
  );
}
async function profilePage() {
  if (!requester()) {
    const [map, bank] = await Promise.all([api('/map?scope=mine'), api('/bank')]);
    return shell(volunteerProfile(state.user, map.summary, bank), 'profile', '', false, 'volunteer-profile');
  }
  const [map, bank] = await Promise.all([api('/map?scope=mine'), api('/bank')]);
  return shell(requesterProfile(state.user, map.summary, bank), 'profile', '', false, 'requester-profile');
}

async function render() {
  const token = ++renderToken;
  const route = current();
  dirty = false;
  if (!state.user) {
    document.documentElement.classList.remove('large-text');
    document.title = '时光有路 · 登录';
    root.innerHTML = login();
    return;
  }
  if (!state.user.profileComplete) {
    root.innerHTML = completeProfile();
    return;
  }
  root.setAttribute('aria-busy', 'true');
  try {
    let html;
    const [page, id] = route.split('/');
    if (page === 'map' || page === 'login') html = await mapPage();
    else if (page === 'services') html = await servicesPage();
    else if (page === 'bank') html = await bankPage();
    else if (page === 'profile') html = await profilePage();
    else if (page === 'task') html = await taskPage(id);
    else if (page === 'booking') html = await bookingPage(id);
    else if (page === 'publish') html = await publishPage(id || 'help');
    else throw new Error('页面不存在');
    if (token !== renderToken) return;
    baiduMap.suspend();
    mapSheet.unmount();
    root.innerHTML = html;
    const publication = root.querySelector('#publish-form');
    if (publication) { syncPublication(publication); void mountPlacePreview(publication, state.config.map); }
    mapSheet.mount(state);
    if (document.querySelector('#baidu-map-slot'))
      void baiduMap
        .mount(state, {
          select: (action, id) => onAction(action, id).catch((e) => toast(e.message)),
        })
        .then((ready) => {
          if (token !== renderToken || !document.querySelector('#baidu-map-slot')) return;
          if (ready && !state.mapAutoLocateAttempted) return onAction('map-auto-locate');
          if (!ready && !state.city) {
            const label = document.querySelector('.map-region-label');
            if (label) label.textContent = '点击定位';
          }
        })
        .catch((e) => toast(e.message));
    document.title = `时光有路 · ${root.querySelector('h1')?.textContent || '爱心地图'}`;
  } catch (e) {
    if (token === renderToken)
      root.innerHTML = shell(
        `<section class="card">${empty('暂时无法打开', e.message)}${btn('重新加载', 'refresh', '', 'primary')}${link('返回爱心地图', 'map')}</section>`,
        'map',
        '稍后重试',
        true,
      );
  } finally {
    root.removeAttribute('aria-busy');
  }
}

async function onAction(action, id, button) {
  if (action === 'pub-more') {
    const form = root.querySelector('#publish-form');
    form.querySelector('.pub-more').open = true;
    form.elements.namedItem(id)?.focus();
    return;
  }
  if (action === 'pub-duration') {
    const form=root.querySelector('#publish-form');
    if (!form.elements.start.value) { form.elements.start.focus(); return; }
    form.elements.end.value=localTime(Date.parse(form.elements.start.value)+Number(id)*60000);
    syncPublication(form, 'end'); dirty=true; return;
  }
  if (action === 'pub-place' || action === 'pub-org-address') {
    const form=root.querySelector('#publish-form');
    const currentPlace=form.elements.place.value ? JSON.parse(form.elements.place.value) : null;
    return choosePlace({ config:state.config.map, place:currentPlace, region:form.elements.region.value,
      query:action === 'pub-org-address' ? state.user.address : '', onChoose:place=>{
        if (!form.isConnected) return;
        form.elements.place.value=JSON.stringify(place);
        form.elements.lat.value=''; form.elements.lng.value='';
        form.elements.address.value=place.address;
        form.elements.region.value=[place.city,place.district].filter(Boolean).join(' · ') || form.elements.region.value;
        form.querySelector('#pub-place-name').textContent=place.name;
        form.querySelector('#pub-place-address').textContent=place.address;
        dirty=true; void mountPlacePreview(form,state.config.map);
      }});
  }
  if (action === 'requester-org-info')
    return modal('机构资料', `<h3>${esc(state.user.name)}</h3><p>${esc(state.user.region)}</p><dl><dt>机构联系人</dt><dd>${esc(state.user.contact || '待完善')}</dd><dt>联系电话</dt><dd>${esc(state.user.contactPhone || state.user.phone)}</dd><dt>机构地址</dt><dd>${esc(state.user.address || '待完善')}</dd></dl>${btn('编辑资料', 'edit-profile', '', 'primary wide')}`);
  if (action === 'requester-bank-metric') {
    state.bankTab = id === 'bookings' ? 'bookings' : 'ledger';
    state.requesterBankFilter = id === 'pending' ? { mode: 'pending' } : {};
    state.requesterBookingWorkOnly = id === 'bookings';
    state.bookingStatus = '';
    if (current() !== 'bank') return go('bank');
    await render();
    root.querySelector('.rb-content')?.scrollIntoView({ block: 'start' });
    return;
  }
  if (action === 'requester-completed') {
    state.tab = 'discover';
    state.requesterStatus = 'completed';
    state.filter = {};
    return go('services');
  }
  if (action === 'requester-bank-reset') {
    state.requesterBankFilter = {};
    return render();
  }
  if (action === 'requester-booking-work') {
    state.requesterBookingWorkOnly = !state.requesterBookingWorkOnly;
    return render();
  }
  if (action === 'requester-bank-filter') {
    const f = state.requesterBankFilter;
    const options = {
      date: ['筛选日期', field('date', '记录日期（留空不限）', f.date || '', 'date', false)],
      task: ['筛选任务', select('task', '帮扶任务', [['', '全部任务'], ...state.requesterBankTasks.filter((t) => t.kind === 'help').map((t) => [t.id, t.title || '未命名草稿'])], f.task)],
      'booking-status': ['筛选预约状态', select('bookingStatus', '预约状态', [['', '全部状态'], ...['pending', 'accepted', 'reschedule', 'result_pending', 'disputed', 'completed', 'cancelled', 'rejected'].map((value) => [value, labels[value]])], state.bookingStatus)],
    };
    const option = options[id];
    if (!option) return;
    return modal(option[0], option[1] + btn('取消', 'close', '', 'text-button'), async (b) => {
      if (id === 'booking-status') state.bookingStatus = b.bookingStatus;
      else state.requesterBankFilter = { ...f, ...b };
      dialog.close();
      await render();
    }, '应用筛选');
  }
  if (action === 'profile-history') {
    state.tab = 'mine';
    state.filter = { status: 'completed' };
    go('services');
    return;
  }
  if (action === 'profile-bank') {
    state.bankTab = id === 'ledger' ? 'ledger' : 'offers';
    state.bankFilter = {};
    if (id === 'ledger') {
      state.ledgerType = 'credit';
      state.ledgerDate = '';
    }
    go('bank');
    return;
  }
  if (action === 'profile-balance-help')
    return modal(
      '可用时间说明',
      '<p>可用时间来自需求方已确认的实际志愿服务，按发放机构分别使用。</p><p>待确认、兑换占用及异议冻结的时间不计入可用余额。兑换使用时间不会减少累计志愿贡献，也不会抹去已有爱心足迹。</p>',
    );
  if (action === 'profile-help')
    return modal(
      '帮助与反馈',
      `<details open><summary>如何积累时间与点亮地图？</summary><p>报名并完成真实服务，需求方确认有效时长后，时间入账并点亮服务所在地区。同一地点多次服务会保留记录，不重复增加地点数。</p></details><details><summary>为什么可用时间与累计贡献不同？</summary><p>待确认时间不能使用，兑换预约会占用对应机构的时间。兑换完成会扣除可用权益，但累计贡献与足迹保留。</p></details><details><summary>如何查看报名与兑换进度？</summary><p>帮扶任务在服务大厅的“我参与的”跟进；兑换申请在时间银行的“我的兑换”跟进。消息可直接打开相关任务。</p></details><div class="actions">${btn('使用说明与隐私约定', 'terms')}${btn('意见反馈', 'feedback', '', 'primary')}</div>`,
    );
  if (action === 'bank-reset') {
    state.bankFilter = {};
    return render();
  }
  if (action === 'bank-booking-status') {
    state.bookingStatus = id;
    return render();
  }
  if (action === 'bank-ledger') {
    state.bankLedgerFilter = { org: state.bankFilter.org || '', type: id || '' };
    return openBankLedger();
  }
  if (action === 'bank-ledger-reset') {
    state.bankLedgerFilter = {};
    return openBankLedger();
  }
  if (action === 'bank-account-info') {
    const a = bankAccount(state.bank.accounts, state.bankFilter.org);
    return modal(
      '时间账户说明',
      `<p class="notice">${state.bankFilter.org ? '当前机构' : '各机构合计'}累计贡献 <strong>${hours(a.contributed)} 小时</strong>。兑换不会减少已确认的志愿贡献和爱心足迹。</p><dl><dt>可用时间</dt><dd>${hours(a.available)} 小时</dd><dt>待确认</dt><dd>${hours(a.pending)} 小时</dd><dt>兑换占用</dt><dd>${hours(a.held)} 小时</dd><dt>已使用</dt><dd>${hours(a.used)} 小时</dd><dt>异议冻结</dt><dd>${hours(a.disputed)} 小时</dd></dl><p>每 1 小时经核实的有效志愿服务记录为 1 小时时间权益，出行和休息不计入。权益按确认时长的机构分别使用，不能跨机构合并花费，也不能转让或提现。</p>${btn('查看收支明细', 'bank-ledger', '', 'primary wide')}`,
    );
  }
  if (action === 'bank-filter') {
    const f = state.bankFilter;
    const options = {
      org: [
        '切换机构',
        select(
          'org',
          '服务机构',
          [
            ['', '全部机构'],
            ...state.bank.accounts.map((a) => [a.orgId, `${a.orgName} · 可用 ${hours(a.available)} 小时`]),
          ],
          f.org,
        ) +
          '<p class="notice">选择机构后，同步查看该机构账户、可兑换服务和本人的兑换记录。不同机构的时间权益分别使用。</p>',
      ],
      date: ['预约日期', field('date', '选择预约日期（留空不限）', f.date || '', 'date', false)],
      minutes: [
        '所需时长',
        select(
          'minutes',
          '兑换所需时间',
          [
            ['', '不限时长'],
            ['30', '30 分钟以内'],
            ['60', '1 小时以内'],
            ['90', '1.5 小时以内'],
            ['120', '2 小时以内'],
            ['180', '3 小时以内'],
          ],
          f.minutes,
        ),
      ],
      sort: [
        '排序方式',
        select(
          'sort',
          '选择排序方式',
          [
            ['', '默认排序'],
            ['start', '预约时间优先'],
            ['minutes', '所需时长从少到多'],
            ['remaining', '剩余名额从多到少'],
          ],
          f.sort,
        ),
      ],
    };
    const option = options[id];
    if (!option) return;
    return modal(
      option[0],
      option[1] +
        `<div class="actions">${btn('重置本项', 'bank-filter-clear', '', 'text-button')}${btn('取消', 'close', '', 'text-button')}</div>`,
      async (values) => {
        state.bankFilter = { ...state.bankFilter, ...values };
        dialog.close();
        await render();
      },
      '应用筛选',
    );
  }
  if (action === 'bank-filter-clear') {
    for (const input of dialog.querySelectorAll('input, select')) input.value = '';
    return;
  }
  if (action === 'hall-status') {
    state.filter.status = id;
    return render();
  }
  if (action === 'requester-status') {
    state.requesterStatus = id;
    return render();
  }
  if (action === 'requester-todo-filter') {
    state.requesterTodoFilter = state.requesterTodoFilter === id ? '' : id;
    return render();
  }
  if (action === 'request-time-change') {
    const t = state.task;
    return modal(
      '申请调整服务时间',
      `${field('start', '建议开始时间', localTime(t.start), 'datetime-local')}${field('end', '建议结束时间', localTime(t.end), 'datetime-local')}${field('reason', '调整原因', '', 'textarea')}<p class="muted">需求方同意并完成相关人员确认后，新安排生效。</p>`,
      (b) => mutate('/applications/' + id, { ...b, action: 'request-change' }),
      '提交申请',
    );
  }
  if (action === 'accept-request-change') {
    const a = state.task.applications.find((x) => x.id === id);
    return modal(
      '确认调整时间',
      `<p>${esc(a.volunteer.name)}申请调整为：</p><p>${dateTime(a.changeRequest.start)} — ${dateTime(a.changeRequest.end)}</p><p>${esc(a.changeRequest.reason)}</p><p class="muted">其他已确认志愿者仍需确认新安排。</p>`,
      () => mutate('/applications/' + id, { action }),
      '同意调整',
    );
  }
  if (action === 'reject-request-change') return reason('不通过时间调整', '/applications/' + id, action);
  if (action === 'handle-withdrawal')
    return modal(
      '处理人员退出',
      `${field('reason', '人员安排说明', '', 'textarea')}<p class="muted">记录已联系、补招或调整安排的情况，原退出记录会保留。</p>`,
      (b) => mutate('/applications/' + id, { ...b, action }),
      '完成处理',
    );
  if (action === 'hall-filter') {
    const f = state.filter;
    const options = {
      category: [
        '服务类型',
        select('category', '选择服务类型', [['', '全部类型'], ...hallCategories], f.category),
      ],
      distance: [
        '距离与区域',
        field('region', '服务区域（留空查看全部）', f.region || state.city, 'text', false) +
          select(
            'distance',
            '距离范围',
            [
              ['', '不限距离'],
              ['1', '1 公里内'],
              ['3', '3 公里内'],
              ['5', '5 公里内'],
              ['10', '10 公里内'],
            ],
            f.distance,
          ) +
          '<p class="notice">地图路线尚未接入，可先按区域查找。选择距离范围时，无法确认距离的需求不会计入结果。</p>',
      ],
      date: ['预约日期', field('date', '选择预约日期（留空不限）', f.date, 'date', false)],
      minutes: [
        '服务时长',
        select(
          'minutes',
          '有效服务时长',
          [
            ['', '不限时长'],
            ['30', '30 分钟以内'],
            ['60', '1 小时以内'],
            ['90', '1.5 小时以内'],
            ['120', '2 小时以内'],
            ['180', '3 小时以内'],
          ],
          f.minutes,
        ) +
          select(
            'budget',
            '我的可用时间（含往返）',
            [
              ['', '不限可用时间'],
              ['30', '我有 30 分钟'],
              ['60', '我有 60 分钟'],
              ['90', '我有 90 分钟'],
            ],
            f.budget,
          ) +
          '<p class="notice">可用时间包含服务、往返出行和 10 分钟缓冲；未知路线耗时的需求不会计入推荐。</p>',
      ],
      sort: [
        '排序方式',
        select(
          'sort',
          '选择排序方式',
          [
            ['distance', '距离优先'],
            ['start', '开始时间优先'],
          ],
          f.sort || 'distance',
        ) + '<p class="muted">距离未知的需求按开始时间排列；接入路线后优先显示距离已知的需求。</p>',
      ],
      org: [
        '服务机构',
        select(
          'org',
          '选择服务机构',
          [
            ['', '全部机构'],
            ...new Map((state.ownServices || []).map((t) => [t.owner, t.orgName])).entries(),
          ],
          f.org,
        ),
      ],
    };
    const [title, fields] = options[id];
    return modal(
      title,
      fields +
        '<div class="hall-modal-actions"><button type="button" class="text-button" data-action="hall-clear-fields">重置本项</button><button type="button" class="text-button" data-action="close">取消</button></div>',
      async (values) => {
        state.filter = { ...state.filter, ...values };
        dialog.close();
        await render();
      },
      '应用筛选',
    );
  }
  if (action === 'hall-clear-fields') {
    for (const input of dialog.querySelectorAll('input, select'))
      input.value = input.name === 'sort' ? 'distance' : '';
    return;
  }
  if (action === 'close') {
    if (!mayDiscardProfileForm()) return;
    dialog.close();
    return;
  }
  if (action === 'back') {
    history.length > 1 ? history.back() : go('map');
    return;
  }
  if (action === 'refresh') return state.config ? render() : boot();
  if (action === 'login-role' && ['volunteer', 'requester'].includes(id)) return loginForm(id);
  if (action === 'terms') return modal('使用说明与隐私约定', termsContent());
  if (action === 'logout')
    return modal(
      '退出当前账户',
      '<p>服务记录和时间账户会保存在数据库中。确认退出？</p>',
      async () => {
        await api('/auth/logout', 'POST', {});
        dialog.close();
        state.user = null;
        state.csrf = null;
        state.filter = {};
        go('login');
        await render();
      },
      '退出登录',
    );
  if (action === 'service-tab') {
    state.tab = id;
    state.filter = {};
    return render();
  }
  if (action === 'bank-tab') {
    state.bankTab = id;
    if (requester()) state.filter = {};
    if (requester() && id === 'ledger') delete state.requesterBankFilter.mode;
    return render();
  }
  if (action === 'reset-filter') {
    state.filter = {};
    return render();
  }
  if (action === 'footprints') {
    state.mapScope = 'mine';
    if (current() !== 'map') state.city = '';
    state.selectedCell = null;
    if (current() === 'map') return render();
    go('map');
    return;
  }
  if (action === 'collective') {
    state.mapScope = 'all';
    return render();
  }
  if (action === 'history') {
    state.tab = requester() ? 'discover' : 'mine';
    state.filter = {};
    state.requesterStatus = '';
    go('services');
    return;
  }
  if (action === 'my-bookings') {
    state.bankTab = 'bookings';
    state.bookingStatus = '';
    state.bankFilter = {};
    state.requesterBookingWorkOnly = false;
    go('bank');
    return;
  }
  if (action === 'collapse') {
    return mapSheet.setCollapsed(!state.collapsed);
  }
  if (action === 'map-scope') {
    state.mapScope = id;
    state.selectedCell = null;
    return render();
  }
  if (action === 'map-task') {
    state.selectedTask = id;
    state.selectedCell = null;
    state.collapsed = false;
    return render();
  }
  if (action === 'map-cell') {
    state.selectedCell = id;
    state.selectedTask = null;
    state.collapsed = false;
    return render();
  }
  if (action === 'map-clear') {
    state.selectedTask = null;
    state.selectedCell = null;
    return render();
  }
  if (action === 'map-contribution') {
    state.bankTab = 'ledger';
    state.ledgerType = 'credit';
    go('bank');
    return;
  }
  if (action === 'map-todo') {
    state.tab = 'todo';
    state.filter = {};
    go('services');
    return;
  }
  if (action === 'map-publish') return go('publish/help');
  if (action === 'map-more') {
    if (state.city) state.filter = { ...state.filter, region: state.city };
    state.tab = requester() ? 'todo' : 'discover';
    go('services');
    return;
  }
  if (action === 'map-explore') {
    state.showNeeds = true;
    state.collapsed = false;
    state.selectedCell = null;
    state.selectedTask = null;
    await render();
    document.querySelector('#map-action')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (action === 'map-zoom-in') return baiduMap.zoom(1);
  if (action === 'map-zoom-out') return baiduMap.zoom(-1);
  if (action === 'map-this-area') {
    const region = await baiduMap.centerRegion();
    if (!region) throw new Error('没有识别到当前区域，请手动选择');
    state.city = (region.district || region.city).replace(/市$/, '');
    baiduMap.lastCity = state.city;
    baiduMap.fittedCity = state.city;
    state.selectedCell = null;
    state.selectedTask = null;
    return render();
  }
  if (action === 'map-place') {
    const place = state.placeResults?.[Number(id)];
    if (!place) return;
    dialog.close();
    baiduMap.focus(place.point, place.title);
    toast('已定位到所选地点；可拖动地图后查看此区域的需求');
    const area = document.querySelector('[data-action="map-this-area"]');
    if (area) area.hidden = false;
    return;
  }
  if (['map-locate', 'map-region-locate', 'map-auto-locate'].includes(action)) {
    if (state.mapLocating) return;
    const automatic = action === 'map-auto-locate';
    const updateRegion = action !== 'map-locate';
    const unavailable = locationAccessMessage();
    if (state.config?.map?.provider === 'baidu' && unavailable) {
      state.mapAutoLocateAttempted = true;
      if (automatic) {
        const label = document.querySelector('.map-region-label');
        if (label && !state.city) label.textContent = '点击定位';
        return;
      }
      return modal('定位提示', '<p>' + esc(unavailable) + '</p><div class="actions">' +
        btn(updateRegion ? '手动选择地区' : '手动搜索位置', updateRegion ? 'city' : 'map-search') + '</div>');
    }
    if (state.config?.map?.provider === 'baidu') {
      if (!automatic) dialog.close();
      state.mapAutoLocateAttempted = true;
      state.mapLocating = true;
      const updateButtons = () => {
        document
          .querySelectorAll('[data-action="map-region-locate"], [data-action="map-locate"]')
          .forEach((b) => {
            b.disabled = state.mapLocating;
            b.setAttribute('aria-busy', String(state.mapLocating));
          });
        const label = document.querySelector('.map-region-label');
        if (label)
          label.textContent = state.mapLocating
            ? '定位中…'
            : (state.mapRegion?.query === state.city && state.mapRegion.label) || state.city || '点击定位';
      };
      updateButtons();
      try {
        const point = await baiduMap.locate();
        if (updateRegion) {
          const region = await baiduMap.centerRegion(point);
          if (!region || (!region.city && !region.district))
            throw new Error('已找到当前位置，但暂未识别到地区，请重试或手动选择地区。');
          const city = region.city.replace(/市$/, '');
          const district = region.district.replace(/(区|县|市)$/, '');
          state.city = district || city;
          state.mapRegion = {
            query: state.city,
            city,
            district,
            label: [...new Set([city, region.district].filter(Boolean))].join('·'),
          };
          delete state.filter.region;
          state.selectedCell = null;
          state.selectedTask = null;
          state.showNeeds = true;
          // Keep the actual location and zoom after refreshing the local needs.
          baiduMap.lastCity = state.city;
          baiduMap.fittedCity = state.city;
          if (current() === 'map') await render();
          if (!automatic) toast('已更新所在地区和附近需求');
        } else toast('已回到当前位置');
      } catch (e) {
        if (current() === 'map' && automatic) toast(e.message + ' 点击左上角可重试。');
        else if (current() === 'map')
          modal(
            '定位提示',
            '<p>' +
              esc(e.message) +
              '</p><div class="actions">' +
              btn('重新定位', action, '', 'primary') +
              btn(updateRegion ? '手动选择地区' : '手动搜索位置', updateRegion ? 'city' : 'map-search') +
              '</div>',
          );
      } finally {
        state.mapLocating = false;
        updateButtons();
      }
      return;
    }
    return modal(
      '回到当前位置',
      '<p>请先手动选择所在城市或服务区域。</p>' + btn('手动选择所在区域', 'city', '', 'primary wide'),
    );
  }
  if (action === 'city')
    return modal(
      '选择服务区域',
      field('city', '城市或区县（留空查看全部）', state.city, 'text', false) +
        '<p class="map-filter-note">支持按需求中的区域名称查找，例如“杭州”或“西湖”。</p>',
      async (b) => {
        state.city = b.city.trim();
        state.mapRegion = null;
        delete state.filter.region;
        state.selectedCell = null;
        state.selectedTask = null;
        dialog.close();
        await render();
      },
      '查看这个区域',
    );
  if (action === 'map-search')
    return modal(
      '搜索地点、社区服务',
      field('q', '地点、需求或机构关键词', state.filter.q || '', 'search', false) +
        (state.config?.map?.provider === 'baidu'
          ? select(
              'mode',
              '搜索内容',
              [
                ['place', '地图地点与社区'],
                ['needs', '本平台的帮扶需求'],
              ],
              'place',
            )
          : ''),
      async (b) => {
        if (b.mode === 'place') {
          state.placeResults = await baiduMap.search(b.q);
          modal(
            '地点搜索结果',
            state.placeResults.length
              ? '<div class="map-place-results">' +
                  state.placeResults
                    .map((p, i) =>
                      btn(
                        '<b>' + esc(p.title) + '</b><small>' + esc(p.address) + '</small>',
                        'map-place',
                        String(i),
                        'map-place-result',
                      ),
                    )
                    .join('') +
                  '</div>'
              : '<p>没有找到这个地点，请补充城市或街道名称后重试。</p>' +
                  btn('重新搜索', 'map-search', '', 'primary wide'),
          );
          return;
        }
        state.filter = { ...state.filter, q: b.q.trim() };
        state.showNeeds = true;
        state.selectedTask = null;
        dialog.close();
        await render();
      },
      '搜索',
    );
  if (action === 'map-filter')
    return modal(
      '发现合适的帮助',
      select('category', '服务类型', [['', '全部类型'], ...categories], state.filter.category) +
        field('date', '预约日期', state.filter.date || '', 'date', false) +
        select(
          'minutes',
          '服务时长',
          [
            ['', '不限'],
            ['30', '30 分钟以内'],
            ['60', '60 分钟以内'],
            ['90', '90 分钟以内'],
            ['180', '3 小时以内'],
          ],
          state.filter.minutes,
        ) +
        '<div class="two-col">' +
        select(
          'distance',
          '服务距离',
          [
            ['', '不限'],
            ['1', '1 公里以内'],
            ['3', '3 公里以内'],
            ['5', '5 公里以内'],
          ],
          state.filter.distance,
        ) +
        select(
          'budget',
          '我有空闲时间（含往返）',
          [
            ['', '不限'],
            ['30', '30 分钟'],
            ['60', '60 分钟'],
            ['90', '90 分钟'],
          ],
          state.filter.budget,
        ) +
        '</div>' +
        '<p class="map-filter-note">距离和空闲时间需要真实路线。当前路线未知，选择这两项将不会推荐需求；已确认的服务安排仍会保留。</p>' +
        btn('重置筛选', 'map-reset-filter', '', 'text-button'),
      async (b) => {
        state.filter = { ...b, ...(state.filter.q ? { q: state.filter.q } : {}) };
        state.selectedTask = null;
        state.showNeeds = true;
        dialog.close();
        await render();
      },
      '应用筛选',
    );
  if (action === 'map-reset-filter') {
    state.filter = {};
    return onAction('map-filter');
  }
  if (action === 'map-regions')
    return modal(
      '服务区域与爱心成果',
      '<p class="map-filter-note">' +
        (state.config?.map?.provider === 'baidu'
          ? '百度地图 · 标记为约 500 米网格中心或区域概略位置。'
          : '插画示意 · 标记按区域排列，不代表实际地理位置。') +
        '已点亮仅代表本产品已有确认服务，并不表示所有需求均已解决。</p><h3>已点亮地区</h3><div class="map-region-list">' +
        (state.cells
          .map((c, i) =>
            btn(
              icon('heart') + ' ' + esc(c.region) + ' · ' + c.count + ' 次帮扶',
              'cell',
              String(i),
              'light-cell',
            ),
          )
          .join('') || '<p class="muted">暂无已确认的点亮成果。</p>') +
        '</div><h3>待帮助需求</h3>' +
        (state.mapNeeds.map(taskCard).join('') || '<p class="muted">当前筛选下暂无可报名需求。</p>'),
    );
  if (action === 'cell') {
    const c = state.cells[Number(id)];
    return modal(
      '这个地方的爱心记忆',
      `<h3>${esc(c.region)}</h3><p>${c.count} 次有效帮扶 · ${c.volunteers} 位共同参与的志愿者</p><p>${esc(c.categories.join('、'))}</p><p>最近更新 ${dateTime(c.latest)}</p><p class="muted">已点亮不代表这里的所有需求都已解决。</p>${btn('继续帮助这里', 'help-cell', id, 'primary wide')}`,
    );
  }
  if (action === 'help-cell') {
    state.city = state.cells[Number(id)].region;
    state.showNeeds = true;
    state.selectedCell = null;
    state.selectedTask = null;
    state.collapsed = false;
    dialog.close();
    return render();
  }
  if (action === 'view-map') {
    state.city = state.task.region;
    state.mapScope = 'all';
    state.selectedTask = id;
    state.selectedCell = null;
    state.collapsed = false;
    go('map');
    return;
  }
  if (action === 'route')
    return modal(
      '到达与联系说明',
      `<p class="notice">百度地图路线待接入，暂不能提供真实距离和预计耗时。</p><p>${esc(state.task.address || state.task.region)}</p><p>${esc(state.task.meeting || '请与机构确认集合安排。')}</p>${state.task.phone ? `<a class="primary wide" href="tel:${esc(state.task.phone)}">联系 ${esc(state.task.contact)}</a>` : ''}${btn('复制文字地址', 'copy-address', '', 'secondary wide')}`,
    );
  if (action === 'copy-address') {
    await navigator.clipboard.writeText(state.task.address || state.task.region);
    toast('地址已复制');
    return;
  }
  if (action === 'edit-profile')
    return modal(
      '编辑资料',
      profileEditor(state.user),
      async (b) => {
        state.user = await api('/profile', 'PUT', b);
        dialog.close();
        await render();
        toast('资料已保存');
      },
      '保存资料',
      true,
    );
  if (action === 'settings')
    return modal(
      '设置',
      accountSettings(state.user),
      async (b) => {
        state.user = await api('/profile', 'PUT', {
          ...state.user,
          settings: { fontSize: b.fontSize, notifications: b.notifications === 'on' },
        });
        dialog.close();
        await render();
        toast('设置已保存');
      },
      '保存设置',
      true,
    );
  if (action === 'feedback') {
    const list = await api('/feedback');
    return modal(
      '意见反馈',
      field('content', '你的建议或遇到的问题', '', 'textarea') +
        `<details><summary>已提交反馈（${list.length}）</summary>${list.map((f) => `<p>${dateTime(f.created)} · 已收到<br>${esc(f.content)}</p>`).join('')}</details>`,
      (b) => mutate('/feedback', b),
      '提交反馈',
    );
  }
  if (action === 'notices') {
    const list = await api('/notices');
    return modal(
      '消息通知',
      `${btn('全部标为已读', 'read-all', '', 'text-button')}${list.map((n) => `<button class="notice-item ${n.read ? 'read' : ''}" data-action="notice" data-id="${esc(n.id)}" data-target="${esc(n.target)}"><b>${esc(n.title)}</b><small>${dateTime(n.created)}</small></button>`).join('') || empty('暂无消息')}`,
    );
  }
  if (action === 'notice') {
    await api('/notices/' + encodeURIComponent(id), 'POST', {});
    dialog.close();
    if (current() === button.dataset.target) await render();
    else go(button.dataset.target);
    return;
  }
  if (action === 'read-all') {
    await api('/notices/read', 'PUT', {});
    if (['services', 'bank'].includes(current()) && requester()) await render();
    return onAction('notices');
  }
  if (action === 'audit') {
    const list = await api('/audit/' + id);
    return modal(
      '变更与核实记录',
      list
        .map(
          (a) =>
            `<article class="record-block"><b>${esc({ create: '创建', edit: '编辑', cancel: '取消', confirm: '核实', correct: '更正', resolve: '异议处理', revoke: '撤销', location: '更正地点', 'booking-correction': '兑换更正' }[a.action] || a.action)}</b><p>${esc(a.reason || '记录已保存')}</p><small>${dateTime(a.created)}</small>${a.before?.confirmed !== undefined ? `<p>确认时长 ${a.before.confirmed} → ${a.after.confirmed} 分钟</p>` : ''}</article>`,
        )
        .join('') || empty('暂无变更记录'),
    );
  }
  if (action === 'comments') {
    const list = await api('/comments/' + id);
    return modal(
      '任务留言与评价',
      `<div class="comments">${list.map((c) => `<article><b>${esc(c.name)} · ${c.type === 'review' ? '评价' : '留言'}</b><p class="pre">${esc(c.content)}</p><small>${dateTime(c.created)}</small></article>`).join('') || '<p>还没有留言，可在这里沟通本次安排。</p>'}</div>${select(
        'type',
        '内容类型',
        [
          ['message', '留言'],
          ['review', '服务评价'],
        ],
      )}${field('content', '内容', '', 'textarea')}`,
      (b) => mutate('/comments/' + id, b),
      '发送',
    );
  }
  if (action === 'files') {
    const files = await api('/files/' + id);
    return modal(
      '本次服务材料',
      `${files.map((f) => `<p><a href="/api/attachments/${esc(f.id)}" download>${esc(f.name)}</a> · ${dateTime(f.created)}</p>`).join('') || '<p>暂无附件</p>'}${state.config.adapters.upload === 'local' ? `<p class="notice">开发环境附件存放本地，未接入 COS。仅相关参与者可访问。请勿上传不必要的敏感资料。</p>${field('file', '选择图片或 PDF（最大 3MB）', '', 'file', true, 'accept="image/png,image/jpeg,image/webp,application/pdf"')}` : '<p class="notice">COS 尚未配置，暂不开放附件上传。仍可通过服务文字记录完成核实。</p>'}`,
      state.config.adapters.upload === 'local'
        ? async (b, form) => {
            const file = form.elements.file.files[0];
            if (file.size > 3000000) throw new Error('附件不能超过 3MB');
            const base64 = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result.split(',')[1]);
              r.onerror = reject;
              r.readAsDataURL(file);
            });
            await mutate('/attachments', { ref: id, name: file.name, type: file.type, base64 });
          }
        : null,
      '上传材料',
    );
  }
  if (action === 'preview-task') return previewPublication();
  if (action === 'apply')
    return modal(
      '报名参与',
      `<p>报名后等待机构确认。通过后可查看集合地址。</p>${field('message', '给机构的留言', '', 'textarea', false)}`,
      (b) => mutate('/tasks/' + id + '/apply', b),
      '提交报名',
    );
  const simpleApps = {
    'accept-app': 'accept',
    checkin: 'checkin',
    'accept-change': 'change',
    'decline-change': 'change',
  };
  if (simpleApps[action])
    return mutate('/applications/' + id, {
      action: simpleApps[action],
      ...(action.endsWith('change') ? { answer: action === 'accept-change' ? 'accept' : 'decline' } : {}),
    });
  if (action === 'reject-app' || action === 'withdraw')
    return reason(
      action === 'withdraw' ? '退出报名' : '不通过报名',
      '/applications/' + id,
      action === 'withdraw' ? 'withdraw' : 'reject',
    );
  if (['pause-task', 'publish-task', 'copy-task'].includes(action)) {
    const result = await mutate('/tasks/' + id + '/action', {
      action: { 'pause-task': 'pause', 'publish-task': 'publish', 'copy-task': 'copy' }[action],
    });
    if (action === 'copy-task') go('publish/' + result.id);
    return;
  }
  if (action === 'cancel-task') return reason('取消这项需求', '/tasks/' + id + '/action', 'cancel');
  if (action === 'location')
    return modal(
      '核实主要成果地点',
      `<p class="notice">只修正统计地点，不修改已约定的私人地址，不增加时长。已有成果会按新地点重新计算。</p>${field('lat', '纬度', state.task.lat, 'number', true, 'step="any" min="-85" max="85"')}${field('lng', '经度', state.task.lng, 'number', true, 'step="any" min="-180" max="180"')}${field('reason', '核实依据', '', 'textarea')}`,
      (b) => mutate('/tasks/' + id + '/action', { action: 'location', ...b }),
    );
  if (action === 'submit-record') {
    const t = state.task,
      a = t.application;
    return modal(
      '提交实际服务记录',
      `${field('start', '实际开始', localTime(a.record?.start || t.start), 'datetime-local')}${field('end', '实际结束', localTime(a.record?.end || new Date(Math.min(Date.now(), Date.parse(t.end)))), 'datetime-local')}${field('rest', '休息分钟', a.record?.rest || 0, 'number', true, 'min="0" max="1440"')}${field('content', '实际完成的服务', a.record?.content, 'textarea')}${field('note', '未签到／补录／异常说明', a.record?.note, 'textarea', !a.checkin)}<p>有效时长按起止时间减去休息计算；由机构核实后入账。</p>`,
      (b) => mutate('/applications/' + id, { action: 'submit', ...b }),
      '提交核实',
    );
  }
  if (['confirm-record', 'resolve-record', 'correct-record'].includes(action)) {
    const r = state.records[id];
    return modal(
      '核实实际服务',
      `<p>提交 ${r.submitted} 分钟 · ${esc(r.content)}</p>${field('minutes', '确认有效分钟', r.status === 'submitted' ? r.submitted : r.confirmed, 'number', true, `min="0" max="${r.submitted}"`)}${field('recipients', '实际受助人次', r.recipients || 1, 'number', true, 'min="0" max="10000"')}${field('reason', '核实／更正说明', r.reason, 'textarea', action !== 'confirm-record')}<p>时长少于提交值时必须填写说明。更正会同步时间账户和地图。</p>`,
      (b) =>
        mutate('/records/' + id, {
          action: { 'confirm-record': 'confirm', 'resolve-record': 'resolve', 'correct-record': 'correct' }[
            action
          ],
          ...b,
        }),
    );
  }
  if (action === 'revoke-record')
    return reason('撤销无效服务记录', '/records/' + id, 'revoke', { recipients: 0 });
  if (action === 'dispute-record') return reason('对服务结果提出异议', '/records/' + id, 'dispute');
  if (action === 'book')
    return modal(
      '申请时间兑换',
      `<p>将占用 ${state.task.minutes} 分钟对应机构的时间权益，待双方确认履约后扣除。</p>${field('recipient', '受助对象（本人或家中老人）')}${field('phone', '联系电话', state.user.phone, 'tel')}${field('needs', '需要协助的事项', '', 'textarea', false)}<label class="check-row"><input name="consent" type="checkbox" required>我已获得受助者同意并核对服务安排</label>`,
      async (b) => {
        const booking = await api('/tasks/' + id + '/book', 'POST', { ...b, consent: b.consent === 'on' });
        dialog.close();
        state.bankTab = 'bookings';
        state.bookingStatus = '';
        go('booking/' + booking.id);
        toast('申请已提交，时间已占用，等待需求方确认');
      },
      '确认申请',
    );
  const bookingActions = {
    'accept-booking': ['accept'],
    'accept-reschedule': ['respond', 'accept'],
    'decline-reschedule': ['respond', 'decline'],
    'accept-extra': ['extra-response', 'accept'],
    'decline-extra': ['extra-response', 'decline'],
    'accept-correction': ['correction-response', 'accept'],
    'decline-correction': ['correction-response', 'decline'],
    'accept-booking-change': ['task-change', 'accept'],
    'decline-booking-change': ['task-change', 'decline'],
  };
  if (bookingActions[action]) {
    const [a, answer] = bookingActions[action];
    return mutate('/bookings/' + id, { action: a, ...(answer ? { answer } : {}) });
  }
  if (action === 'cancel-booking') return reason('取消兑换预约', '/bookings/' + id, 'cancel');
  if (action === 'dispute-booking') return reason('对兑换结果提出异议', '/bookings/' + id, 'dispute');
  if (action === 'reschedule') {
    const b = state.booking;
    return modal(
      '申请调整预约时间',
      field('start', '新的开始时间', localTime(b.start), 'datetime-local') +
        field('end', '新的结束时间', localTime(b.end), 'datetime-local') +
        field('reason', '改约原因', '', 'textarea'),
      (b) => mutate('/bookings/' + id, { ...b, action: 'reschedule' }),
    );
  }
  if (action === 'booking-result')
    return modal(
      '记录实际履约结果',
      field(
        'minutes',
        '实际服务分钟',
        state.booking.held,
        'number',
        true,
        `min="0" max="${state.booking.held}"`,
      ) +
        field('recipients', '受助人次', 1, 'number', true, 'min="0"') +
        field('content', '实际完成内容／未完成原因', '', 'textarea'),
      (b) => mutate('/bookings/' + id, { ...b, action: 'result' }),
      '提交申请人确认',
    );
  if (action === 'extra')
    return modal(
      '协商追加服务',
      field('minutes', '追加分钟数', 15, 'number', true, 'min="1" max="1440"') +
        field('reason', '追加说明', '', 'textarea'),
      (b) => mutate('/bookings/' + id, { ...b, action: 'extra' }),
    );
  if (action === 'complete-booking')
    return modal(
      '确认兑换结果',
      `<p>${esc(state.booking.result.content)}</p><p>确认实际服务 ${state.booking.result.minutes} 分钟，结算后释放其余占用。</p>`,
      () => mutate('/bookings/' + id, { action: 'complete' }),
      '确认完成并结算',
    );
  if (action === 'booking-correction')
    return modal(
      '申请更正实际扣除',
      field(
        'minutes',
        '更正后扣除分钟',
        state.booking.charged,
        'number',
        true,
        `min="0" max="${state.booking.charged}"`,
      ) +
        field('reason', '更正原因', '', 'textarea') +
        '<p>对方同意后，差额退回对应机构账户，并重新计算兑换成果。</p>',
      (b) => mutate('/bookings/' + id, { ...b, action: 'correction' }),
    );
  if (action === 'share') return shareCard();
}

async function shareCard() {
  const data = await api('/map?scope=mine'),
    s = data.summary;
  if (!s.services) {
    toast('有已核实的服务记录后，即可生成足迹卡');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff6ee';
  c.fillRect(0, 0, 720, 900);
  c.fillStyle = '#ef715f';
  await document.fonts.load('600 34px MiSans');
  c.font = '600 34px MiSans';
  c.fillText('时光有路 · 我的爱心足迹', 55, 85);
  c.fillStyle = '#253644';
  c.font = '600 44px MiSans';
  c.fillText('每一份善意，都有迹可循', 55, 180);
  c.font = '28px MiSans';
  c.fillText(`点亮 ${s.places} 个地点`, 55, 280);
  c.fillText(`完成 ${s.services} 次服务`, 55, 340);
  c.fillText(`累计贡献 ${hours(s.minutes)} 小时`, 55, 400);
  c.font = '22px MiSans';
  c.fillStyle = '#658273';
  [...new Set(data.cells.map((c) => c.region))]
    .slice(0, 6)
    .forEach((region, i) => c.fillText('♡ ' + region, 55, 490 + i * 45, 610));
  c.fillStyle = '#71808d';
  c.fillText('根据已核实记录生成 · 区域文字摘要', 55, 820);
  if (state.config.environment !== 'production') c.fillText('开发环境记录 · 非生产公益成果', 55, 860);
  const url = canvas.toDataURL('image/png');
  modal(
    '预览爱心足迹卡',
    `<img class="share-preview" src="${url}" alt="本人的匿名爱心成果卡"><a class="primary wide" href="${url}" download="时光有路-爱心足迹.png">保存图片后分享</a><p class="privacy-note">未接入地图底图，以区域文字摘要呈现；不包含身份、门牌或联系方式。</p>`,
  );
}

document.addEventListener('click', async (event) => {
  const b = event.target.closest('[data-action]');
  if (!b || b.disabled) return;
  event.preventDefault();
  b.disabled = true;
  try {
    await onAction(b.dataset.action, b.dataset.id, b);
  } catch (error) {
    toast(error.message);
  } finally {
    b.disabled = false;
  }
});
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target,
    submit = event.submitter;
  if (form.dataset.busy) return;
  form.dataset.busy = '1';
  if (submit) submit.disabled = true;
  const b = formData(form);
  try {
    if (form.id === 'modal-form') await modalSubmit(b, form);
    if (form.id === 'login-form') {
      const credentials = { ...state.config.demoAccounts[b.role], role: b.role };
      const result = await api('/auth/demo-login', 'POST', credentials);
      dialog.close();
      state.user = result.user;
      state.csrf = result.csrf;
      state.filter = {};
      state.tab = 'discover';
      state.bankTab = requester() ? 'ledger' : 'offers';
      state.bankFilter = {};
      state.bankInitialized = false;
      state.bankLedgerFilter = {};
      state.bookingStatus = '';
      go('map');
      await render();
    }
    if (form.id === 'profile-form') {
      state.user = await api('/profile', 'PUT', b);
      await render();
    }
    if (form.id === 'filter-form') {
      state.filter = b;
      await render();
    }
    if (form.id === 'hall-search') {
      state.filter = { ...state.filter, q: b.q.trim() };
      await render();
    }
    if (form.id === 'bank-ledger-form') {
      state.bankLedgerFilter = b;
      await openBankLedger();
    }
    if (form.id === 'publish-form') {
      if (submit?.value === 'draft') await savePublication('draft');
      else previewPublication();
    }
  } catch (error) {
    errorIn(form, error);
  } finally {
    delete form.dataset.busy;
    if (submit) submit.disabled = false;
  }
});
document.addEventListener('input', (e) => {
  const form=e.target.closest('#publish-form');
  if (form) { dirty=true; syncPublication(form,e.target.name); if(e.target.name==='address') form.querySelector('.pub-mini-map')?.remove(); }
});
document.addEventListener('change', async (e) => {
  const form=e.target.closest('#publish-form');
  if (form) { dirty=true; syncPublication(form,e.target.name); }
  if (e.target.id === 'show-needs') {
    state.showNeeds = e.target.checked;
    await render();
  }
  const name = e.target.name;
  if (name === 'booking-status') {
    state.bookingStatus = e.target.value;
    await render();
  }
  if (name === 'ledger-type') {
    state.ledgerType = e.target.value;
    await render();
  }
  if (name === 'ledger-date') {
    state.ledgerDate = e.target.value;
    await render();
  }
});
dialog.addEventListener('cancel', (e) => {
  if (!mayDiscardProfileForm()) e.preventDefault();
});
window.addEventListener('beforeunload', (e) => {
  if (dirty || profileFormChanged()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('hashchange', async () => {
  if (dirty && !confirm('当前修改尚未保存，确认离开？')) {
    history.replaceState(null, '', lastRoute);
    return;
  }
  state.scroll.set(lastRoute, window.scrollY);
  lastRoute = location.hash;
  dialog.close();
  await render();
  window.scrollTo(0, state.scroll.get(lastRoute) || 0);
  focusTaskSection();
});
async function boot() {
  try {
    [state.config, { user: state.user, csrf: state.csrf }] = await Promise.all([api('/config'), api('/me')]);
    state.bankTab = requester() ? 'ledger' : 'offers';
    await render();
    focusTaskSection();
  } catch (e) {
    root.innerHTML = `<main class="setup-page">${empty('连接暂时不可用', e.message)}${btn('重试', 'refresh', '', 'primary')}</main>`;
  }
}
await boot();
