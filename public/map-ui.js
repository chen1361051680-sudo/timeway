import { esc, icon, btn, link, hours, dateTime } from './ui.js';
import { serviceImage } from './service-image.js';

// Positions are a schematic layout on an illustration, never geographic coordinates.
const needIcons = {
  陪伴交流: 'users',
  生活协助: 'utensils',
  出行陪同: 'accessible',
  陪诊协助: 'medical',
  数字助老: 'book',
  其他: 'leaf',
};

export function availableNeeds(tasks, at = Date.now()) {
  return tasks.filter(
    (t) =>
      t.status === 'published' &&
      t.remaining > 0 &&
      Date.parse(t.start) > at &&
      Date.parse(t.deadline || t.start) > at &&
      !['pending', 'accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'].includes(
        t.application?.status,
      ),
  );
}

function appointment(value) {
  const d = new Date(value);
  if (d.toDateString() === new Date().toDateString())
    return '今天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return dateTime(value);
}

function needCard(t, isRequester, selected = false) {
  if (!t && isRequester)
    return `<div class="map-todo-empty"><span class="map-todo-empty-icon" aria-hidden="true">${icon('clipboard')}${icon('check')}</span><h3>暂无待处理事项</h3><p>新的报名和服务确认会显示在这里</p>${btn(icon('plus') + '发布新需求', 'map-publish', '', 'map-todo-empty-publish')}</div>`;
  if (!t)
    return `<div class="map-empty"><span class="empty-sprout">${icon('leaf')}</span><div><h3>${isRequester ? '暂时没有待处理事项' : '暂时没有合适的爱心需求'}</h3><p>${isRequester ? '发布一份需求，让温暖在这里发生。' : '试试调整日期、服务类型或所在区域。'}</p></div>${btn(icon('arrow'), isRequester ? 'map-publish' : 'map-filter', '', 'map-empty-action', 'aria-label="' + (isRequester ? '发布需求' : '调整筛选') + '"')}</div>`;
  const active =
    t.application && ['accepted', 'checked_in', 'submitted', 'disputed'].includes(t.application.status);
  const label = isRequester
    ? '查看并处理'
    : active
      ? '查看服务安排'
      : t.application?.status === 'pending'
        ? '查看报名进度'
        : t.application?.status === 'confirmed'
          ? '查看服务记录'
          : availableNeeds([t]).length
            ? '查看详情并报名'
            : '查看服务详情';
  return `<article class="map-task-card" data-task-id="${esc(t.id)}">
    <img class="map-task-image" src="${serviceImage(t)}" width="128" height="128" alt="${esc(t.category)}服务图片">
    <div class="map-task-heading"><h3>${esc(t.title)}</h3><p>${icon('building')}<span>${esc(t.orgName)}</span></p></div>
    ${link(`${label}${icon('arrow')}`, 'task/' + t.id, 'map-task-cta')}
    <div class="map-task-meta"><span>${icon('calendar')}${esc(appointment(t.start))}</span><span>${icon('clock')}${hours(t.minutes)}小时</span></div>
    ${selected ? `<div class="map-task-details"><div class="map-task-location">${icon('pin')}<span>${esc(t.region)}</span>${t.remaining > 0 ? `<span class="map-task-vacancy">还需 ${t.remaining} 人</span>` : ''}</div>${t.description ? `<p>${esc(t.description)}</p>` : ''}</div>` : ''}
  </article>`;
}

function regionCard(c, index, mine) {
  return `<article class="map-region-card"><div class="map-region-title">${icon('heart')}<div><h3>${esc(c.region)}</h3><p>${mine ? '我的范围内的成果' : '大家共同留下的温暖'} · ${c.count} 次帮扶 · ${c.volunteers} 位志愿者</p></div></div><p>${esc(c.categories.join(' · '))} · 最近 ${dateTime(c.latest)}</p><div class="map-region-actions">${btn('继续帮助这里 ' + icon('arrow'), 'help-cell', String(index), 'map-task-cta')}${btn('查看爱心记忆', 'cell', String(index), 'text-button')}</div></article>`;
}

export function mapContent({ state, data, needs, cells, action, pending }) {
  const isRequester = state.user.role === 'requester';
  const live = state.config?.map?.provider === 'baidu';
  const mine = state.mapScope === 'mine';
  const selectedCell = cells.find((c) => c.cell === state.selectedCell);
  const selectedIndex = cells.indexOf(selectedCell);
  const s = data.summary;
  const city =
    live && !state.mapAutoLocateAttempted
      ? '定位中…'
      : (state.mapRegion?.query === state.city && state.mapRegion.label) ||
        state.city ||
        (live ? '点击定位' : '全部地区');
  const stat = (i, label, n, unit, actionName) =>
    btn(
      `<span class="map-stat-icon">${icon(i)}</span><span class="map-stat-copy"><span>${label}</span><span><strong>${n}</strong><small>${unit}</small></span></span>`,
      actionName,
      '',
      'map-stat',
    );
  return `<div class="love-map ${live ? 'has-baidu-map' : ''} ${state.collapsed ? 'is-collapsed' : ''}">
    <div class="map-hero">
      <section class="map-stage" aria-label="${live ? '爱心地图，百度地图真实底图' : '爱心地图，插画示意，标记按区域排列'}">
        ${live ? '<div id="baidu-map-slot" data-state="loading"></div><div id="baidu-map-status" role="status"><span class="map-loading-spinner"></span><p>正在加载百度地图…</p></div>' : ''}
        <header class="map-top">
          <div class="map-location-search">${btn(live ? icon('locate') + '<span class="map-region-label">' + esc(state.mapLocating ? '定位中…' : city) + '</span>' : esc(city) + icon('chevron-down'), live ? 'map-region-locate' : 'city', '', 'city-button', live ? 'aria-label="定位并更新所在地区" aria-busy="' + !!state.mapLocating + '" title="' + esc(city) + ' · 点击定位"' + (state.mapLocating ? ' disabled' : '') : 'aria-label="切换城市或区域"')}${btn(icon('search') + '<span>搜索地点、社区服务</span>', 'map-search', '', 'map-search', 'aria-label="搜索地点、社区服务"')}</div>
        </header>
        <div class="map-scope" role="tablist" aria-label="地图查看范围">
          ${btn(icon('heart') + '<span>大家的爱心</span>', 'map-scope', 'all', !mine ? 'active' : '', `role="tab" aria-selected="${!mine}"`)}
          ${btn(icon('footprints') + '<span>' + (isRequester ? '本机构' : '我的足迹') + '</span>', 'map-scope', 'mine', mine ? 'active' : '', `role="tab" aria-selected="${mine}"`)}
        </div>
        <div class="map-controls">
          <label class="map-needs-toggle"><span>待帮助</span><input type="checkbox" role="switch" id="show-needs" aria-label="显示待帮助" ${state.showNeeds ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span></label>
          ${btn(icon('locate'), 'map-locate', '', 'map-locate', 'aria-label="回到当前位置" title="回到当前位置"' + (state.mapLocating ? ' disabled aria-busy="true"' : ''))}
        ${live ? '<div class="baidu-zoom"><button type="button" data-action="map-zoom-in" aria-label="放大地图">+</button><button type="button" data-action="map-zoom-out" aria-label="缩小地图">−</button></div>' : ''}</div>
        ${live ? '<span id="baidu-map-note" hidden></span>' : ''}
        <div class="map-pins" aria-label="服务区域示意标记" ${live ? 'hidden' : ''}>
          ${cells
            .slice(0, 3)
            .map(
              (c, i) =>
                `<button type="button" class="map-pin map-pin-love love-slot-${i} brightness-${c.brightness} ${state.selectedCell === c.cell ? 'is-selected' : ''}" data-action="map-cell" data-id="${esc(c.cell)}" aria-label="${esc(c.region)}，已点亮，${c.count}次帮扶" aria-pressed="${state.selectedCell === c.cell}"><span class="map-glow"></span><span class="pin-shape">${icon('heart')}</span><span class="pin-label">${esc(c.region)}</span><span class="lit-label">已点亮</span></button>`,
            )
            .join('')}
          ${
            state.showNeeds
              ? needs
                  .slice(0, 5)
                  .map(
                    (t, i) =>
                      `<button type="button" class="map-pin map-pin-need need-slot-${i} ${state.selectedTask === t.id ? 'is-selected' : ''}" data-action="map-task" data-id="${esc(t.id)}" aria-label="待帮助：${esc(t.title)}，${esc(t.region)}" aria-pressed="${state.selectedTask === t.id}"><span class="pin-shape">${icon(needIcons[t.category] || 'users')}</span><span class="pin-label">${esc(t.region)}</span></button>`,
                  )
                  .join('')
              : ''
          }
        </div>
        ${!live && !cells.length && (!state.showNeeds || !needs.length) ? `<div class="map-first-light">${icon('heart')}<span>${mine ? '完成一次真实帮助<br>留下你的第一束光' : '每一份善意<br>都让这座城市更温暖'}</span></div>` : ''}
        ${isRequester ? link(icon('plus') + ' 发布需求', 'publish/help', 'map-publish') : ''}
      </section>
    </div>
    <section class="map-sheet" aria-label="${isRequester ? '本机构成果与待办' : '我的成果与附近需求'}">
      ${btn('<span></span>', 'collapse', '', 'map-sheet-grab', `aria-label="${state.collapsed ? '展开需求面板' : '收起需求面板'}" aria-expanded="${!state.collapsed}" aria-controls="map-action" title="上下拖动，展开或收起需求面板"`)}
      <div class="map-summary-banner">
        <div class="map-summary-intro${isRequester ? ' is-requester' : ''}">
          ${isRequester ? `<span class="map-summary-avatar map-org-avatar" role="img" aria-label="${esc(state.user.name)}的机构头像"></span>` : '<span class="map-summary-avatar" aria-hidden="true"><img src="/map-service.webp" alt="" width="80" height="80"></span>'}
          <div class="map-summary-copy"><h2>${isRequester ? esc(state.user.name) : '让善意随时发生<span class="map-summary-rays" aria-hidden="true"><i></i><i></i><i></i></span>'}</h2><p>${isRequester ? '需求方' : '谢谢你，点亮更多人的生活'}</p></div>
        </div>
        <div class="map-stats">${stat('pin', isRequester ? '本机构点亮' : '已点亮地点', s.places, '个', 'footprints')}${stat('heart', isRequester ? '完成帮扶' : '完成服务', s.services, '次', 'history')}${stat(isRequester ? 'clipboard' : 'clock', isRequester ? '待处理事项' : '累计贡献', isRequester ? pending : hours(s.minutes), isRequester ? '项' : '小时', isRequester ? 'map-todo' : 'map-contribution')}</div>
      </div>
      <div class="map-sheet-scroll" ${state.collapsed ? 'hidden' : ''}>
      <div id="map-action" ${state.collapsed ? 'hidden' : ''}>
        <div class="map-action-title"><h2>${icon('heart')}${selectedCell ? '这里的爱心记忆' : state.selectedTask ? '当前选择的需求' : isRequester ? '需要你处理的事项' : action?.application ? '我的服务安排' : '附近的爱心需求'}</h2>${selectedCell || state.selectedTask ? '' : btn('查看更多 ' + icon('arrow'), 'map-more', '', 'map-more')}</div>
        ${selectedCell ? regionCard(selectedCell, selectedIndex, mine) : needCard(action, isRequester, !!state.selectedTask)}
        ${
          !isRequester && !selectedCell && !state.selectedTask
            ? '<div class="map-additional-needs">' +
              needs
                .filter((t) => t.id !== action?.id)
                .slice(0, 2)
                .map((t) => needCard(t, false))
                .join('') +
              '</div>'
            : ''
        }
      </div>
      </div>
    </section>
  </div>`;
}
