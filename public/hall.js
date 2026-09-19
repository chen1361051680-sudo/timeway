import { esc, icon, btn, empty, hours, status } from './ui.js';

export const hallCategories = [
  ['陪伴交流', '陪伴聊天'],
  ['陪诊协助', '陪诊协助'],
  ['生活协助', '生活帮助'],
  ['出行陪同', '户外陪同'],
  ['数字助老', '数字助老'],
  ['其他', '其他'],
];
const artwork = {
  陪伴交流: ['companion', 'blue'],
  陪诊协助: ['medical', 'blue'],
  生活协助: ['housework', 'green'],
  出行陪同: ['walk', 'orange'],
};
const groups = [
  ['', '全部'],
  ['pending', '待处理'],
  ['active', '进行中'],
  ['completed', '已完成'],
  ['other', '其他'],
];
export function hallCard(t) {
  const [art, color] = artwork[t.category] || ['companion', 'blue'];
  const category = hallCategories.find(([value]) => value === t.category)?.[1] || t.category;
  const date = new Date(t.start);
  const parts = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).split('-');
  const day = `${Number(parts[1])}月${Number(parts[2])}日`;
  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
  const action = t.hasPendingChange
    ? '确认变更'
    : {
        accepted: '查看安排',
        checked_in: '服务记录',
        submitted: '查看进度',
        disputed: '处理异议',
        confirmed: '查看成果',
      }[t.application?.status] || '查看详情';
  return `<a class="hall-card" href="#task/${esc(t.id)}">
    <div class="hall-picture"><img src="/images/hall-${art}.webp" alt="" width="1024" height="1024" loading="lazy"><span class="hall-category ${color}">${esc(category)}</span></div>
    <div class="hall-card-content">
      <div class="hall-card-heading"><h3>${esc(t.title)}</h3></div>
      <p class="hall-org" title="${esc(t.orgName)} · ${esc(t.region)}">${icon('home')}<span>${esc(t.orgName)}</span></p>
      <div class="hall-chips"><span>${icon('calendar')}${esc(day)} ${esc(time)}</span><span>${icon('clock')}${hours(t.minutes)}小时</span></div>
      <div class="hall-card-bottom">${t.application ? status(t.application.status) : `<span class="hall-vacancy">还需 <strong>${t.remaining}</strong> 人</span>`}<span class="hall-detail">${action}</span></div>
      ${t.hasPendingChange ? '<p class="hall-change">服务安排有变更，请确认</p>' : ''}
      ${t.application?.status === 'confirmed' ? `<p class="hall-result">已核实 ${hours(t.application.record?.confirmed)} 小时 · 查看入账与点亮成果</p>` : ''}
    </div>
  </a>`;
}

function filterButton(label, id, active, extra = '') {
  return btn(
    `${extra}${esc(label)}${icon('chevron')}`,
    'hall-filter',
    id,
    `hall-filter${active ? ' selected' : ''}`,
    'aria-haspopup="dialog"',
  );
}
export function hallContent({ tasks, own, filter: f, mine, environment }) {
  const count = own.filter(
    (t) =>
      t.hasPendingChange ||
      ['pending', 'accepted', 'checked_in', 'submitted', 'disputed'].includes(t.application?.status),
  ).length;
  const category = hallCategories.find(([value]) => value === f.category)?.[1];
  const active = Object.entries(f).filter(
    ([key, value]) => value && !['sort', 'status'].includes(key),
  ).length;
  return `<header class="hall-header"><h1>服务大厅</h1><p>发现身边的需要 让善意从这里出发</p></header>
    <section class="hall-sheet" aria-label="志愿者服务大厅">
      <div class="hall-tabs" role="tablist" aria-label="服务列表">
        ${btn('发现需求', 'service-tab', 'discover', `hall-tab${!mine ? ' active' : ''}`, `role="tab" aria-selected="${!mine}"`)}
        ${btn(`我参与的${count ? `<span class="hall-count">${count}</span>` : ''}`, 'service-tab', 'mine', `hall-tab${mine ? ' active' : ''}`, `role="tab" aria-selected="${mine}"`)}
      </div>
      <form id="hall-search" class="hall-search" role="search"><button aria-label="搜索" type="submit">${icon('search')}</button><input name="q" type="search" aria-label="搜索服务名称、社区或机构" placeholder="搜索服务名称、社区或机构" value="${esc(f.q || '')}" autocomplete="off"></form>
      <div class="hall-filters" aria-label="筛选需求">
        ${filterButton(category || '服务类型', 'category', f.category)}
        ${filterButton(f.date ? f.date.slice(5).replace('-', '/') : '预约日期', 'date', f.date)}
        ${filterButton(f.minutes ? `${hours(f.minutes)}小时内` : f.budget ? `空闲${f.budget}分` : '服务时长', 'minutes', f.minutes || f.budget)}
      </div>
      ${mine ? `<div class="hall-statuses" aria-label="参与状态">${groups.map(([id, title]) => btn(title, 'hall-status', id, `hall-status${(f.status || '') === id ? ' active' : ''}`, `aria-pressed="${(f.status || '') === id}"`)).join('')}${btn(`${icon('home')} ${esc(f.org ? own.find((t) => t.owner === f.org)?.orgName || '已选机构' : '全部机构')}${icon('chevron')}`, 'hall-filter', 'org', 'hall-org-filter')}</div>` : ''}
      ${active ? `<div class="hall-filter-summary"><span>已选 ${active} 项条件 · ${tasks.length} 个结果</span>${btn('重置', 'reset-filter', '', 'text-button')}</div>` : ''}
      <div class="hall-list" role="tabpanel" aria-label="${mine ? '我参与的' : '发现需求'}">${tasks.length ? tasks.map(hallCard).join('') : `<div class="hall-empty">${empty(mine ? '还没有相关服务记录' : '暂无符合条件的需求', f.budget ? '暂时无法确认往返耗时，请放宽可用时间条件。' : '试试调整筛选条件，让下一份帮助从这里开始。')}<div class="actions">${active || f.status ? btn('重置筛选', 'reset-filter', '', 'primary') : ''}${mine ? btn('去发现需求', 'service-tab', 'discover', 'primary') : '<a class="secondary" href="#map">回到爱心地图</a>'}</div></div>`}</div>
      <p class="hall-end">${tasks.length ? '每一份陪伴，都是温暖的开始' : '帮助一个人，点亮一个地方'}</p>
      ${environment !== 'production' ? '<p class="hall-demo">模拟体验 · 数据与生产隔离 · 服务图片为类型示意</p>' : ''}
    </section>`;
}
