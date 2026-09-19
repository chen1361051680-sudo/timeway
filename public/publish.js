import { esc, icon, field, select, categories, localTime, dateTime, hours, btn } from './ui.js';
import { redeemForm, redeemSummary, redeemMinutes, syncRedeemForm, validateRedeemForm } from './redeem.js';

const samples = {
  陪伴交流: '例如：陪老人聊天、读报，了解近期生活情况。',
  生活协助: '例如：整理生活用品、协助采购，说明具体工作范围。',
  出行陪同: '例如：陪同前往社区活动，说明出发地与目的地。',
  陪诊协助: '例如：协助挂号、取药和院内陪同，说明就诊科室。',
  数字助老: '例如：指导使用手机挂号、视频通话，说明设备与学习内容。',
  其他: '请说明需要做什么、服务流程和必要准备。',
};
export function newPublication(kind, user) {
  if (kind === 'redeem') return { kind, offerType: 'goods', minutes: 60 };
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    kind,
    category: kind === 'redeem' ? '其他' : categories[0],
    region: user.region,
    address: user.address,
    contact: user.contact || user.name,
    phone: user.contactPhone || user.phone,
    capacity: 1,
    minutes: 60,
    start: start.toISOString(),
    end: new Date(+start + 3600000).toISOString(),
    deadline: start.toISOString(),
  };
}
const summaryRow = (glyph, label, value, id) =>
  `<summary><span class="pub-setting-icon">${icon(glyph)}</span><span class="pub-setting-copy"><span>${label}</span><strong id="${id}">${esc(value)}</strong></span>${icon('chevron-down')}</summary>`;
export function publishForm(t, user, old) {
  if (t.kind === 'redeem') return redeemForm(t, user, old);
  const redeem = t.kind === 'redeem';
  const spanMinutes = Math.round((Date.parse(t.end) - Date.parse(t.start)) / 60000);
  const durations = [30, 60, 90, 120, 180, 240];
  const durationOptions = durations.map((m) => [String(m), `${hours(m)} 小时`]);
  durationOptions.push(['custom', '其他时长']);
  const customDuration = !durations.includes(spanMinutes);
  const deadlineGap = Math.round((Date.parse(t.start) - Date.parse(t.deadline)) / 60000);
  const deadlinePreset = [0, 60, 1440].includes(deadlineGap) ? String(deadlineGap) : 'custom';
  return `<form id="publish-form" class="publish-form pub-simple pub-stream" novalidate data-original-plan="${esc(old ? JSON.stringify({ start: localTime(t.start), end: localTime(t.end), minutes: t.minutes }) : '')}">
    <p class="form-error" role="alert"></p>
    <section class="pub-card pub-compose" aria-label="需求内容">
      <div class="pub-compose-heading"><h2>${icon('clipboard')}需求内容</h2>
        <label class="pub-category-control"><span class="pub-sr-only">服务类型</span><select name="category">${categories.map((category) => `<option value="${esc(category)}" ${category === (t.category || categories[0]) ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
      </div>
      <label class="field pub-subject"><span class="pub-subject-label">服务标题</span><input name="title" value="${esc(t.title)}" required maxlength="100" placeholder="例如：陪长者聊天"></label>
      <label class="field pub-description"><span class="pub-sr-only">具体服务内容</span><textarea name="description" required maxlength="3000" rows="3" placeholder="${esc(samples[t.category] || samples.其他)}">${esc(t.description)}</textarea></label>
    </section>
    <section class="pub-card pub-arrange" aria-label="服务安排">
      <h2 class="pub-arrange-heading">${icon('calendar')}服务安排</h2>
      <label class="field pub-start-row"><span>开始时间</span><input name="start" type="datetime-local" value="${esc(localTime(t.start))}" required></label>
      <div class="pub-compact-row pub-schedule-row">${select('scheduleMinutes', '服务多久', durationOptions, customDuration ? 'custom' : String(spanMinutes))}${field('capacity', redeem ? '预约名额' : '志愿者人数', t.capacity, 'number', true, 'min="1" max="200" step="1" inputmode="numeric"')}</div>
      <div class="pub-compact-row pub-custom-duration" role="group" aria-label="其他服务时长" ${customDuration ? '' : 'hidden'}>
        ${field('scheduleHours', '小时', Math.floor(spanMinutes / 60), 'number', true, 'min="0" max="24" step="1" inputmode="numeric"')}
        ${field('scheduleExtraMinutes', '分钟', spanMinutes % 60, 'number', true, 'min="0" max="59" step="1" inputmode="numeric"')}
      </div>
      <p class="pub-time-summary"><span id="pub-end-text"></span><span>${redeem ? '兑换' : '服务'} <span id="pub-duration-text">${hours(t.minutes)} 小时</span></span></p>
      ${redeem ? `<div class="pub-compact-row pub-redeem-duration">${field('durationHours', '兑换所需小时', Math.floor(t.minutes / 60), 'number', true, 'min="0" max="24" step="1"')}${field('durationMinutes', '另加分钟', t.minutes % 60, 'number', true, 'min="0" max="59" step="1"')}</div>` : ''}
      <input type="hidden" name="end" value="${esc(localTime(t.end))}"><input type="hidden" name="minutes" value="${esc(t.minutes)}">
      <div class="pub-location-row">
        <p class="pub-simple-privacy">服务地点将向查看需求的用户公开，用于路线规划。</p>
        <button type="button" class="pub-place-button" data-action="pub-place"><span class="pub-setting-icon">${icon('pin')}</span><span><small class="pub-place-label">服务地点</small><strong id="pub-place-name">${esc(t.place?.name || t.address || '请选择服务地点')}</strong><small id="pub-place-address">${esc(t.place?.address || t.region || '搜索地址或地图选点')}</small></span>${icon('arrow')}</button>
        <input type="hidden" name="place" value="${esc(t.place ? JSON.stringify(t.place) : '')}"><input type="hidden" name="lat" value="${esc(t.lat)}"><input type="hidden" name="lng" value="${esc(t.lng)}">
        <details class="pub-address-details"><summary>手动填写地址</summary><div class="pub-inline-editor">
          ${field('address', '服务详细地址（公开）', t.address, 'text', true, 'maxlength="300" placeholder="填写服务地址"')}
          ${field('region', '公开区域（不含门牌）', t.region, 'text', true, 'maxlength="100" placeholder="例如：杭州市 · 西湖区"')}
          ${user.address ? btn('使用机构常用地址', 'pub-org-address', '', 'pub-address-reuse') : ''}
        </div></details>
      </div>
      <details class="pub-inline-setting pub-deadline-details">${summaryRow('calendar', '报名截止', dateTime(t.deadline), 'pub-deadline-text')}<div class="pub-inline-editor">
        ${select(
          'deadlinePreset',
          '报名截止设置',
          [
            ['0', '服务开始时'],
            ['60', '开始前 1 小时'],
            ['1440', '开始前 1 天'],
            ['custom', '自定义时间'],
          ],
          deadlinePreset,
        )}
        <div class="pub-deadline-custom" ${deadlinePreset === 'custom' ? '' : 'hidden'}>${field('deadline', '报名截止', localTime(t.deadline), 'datetime-local')}</div>
      </div></details>
      <details class="pub-inline-setting pub-contact-details">${summaryRow('user', '机构联系人', [t.contact, t.phone].filter(Boolean).join(' · ') || '请补充联系人', 'pub-contact-text')}<div class="pub-inline-editor pub-compact-row">
        ${field('contact', '机构联系人', t.contact, 'text', true, 'maxlength="80" autocomplete="name"')}
        ${field('phone', '联系电话', t.phone, 'tel', true, 'maxlength="30" autocomplete="tel"')}
      </div></details>
    </section>
    <div class="pub-actions"><p class="pub-submit-status" role="status"></p><div><button class="primary" type="submit">${old ? '预览并保存修改' : '预览并发布'}</button></div></div>
  </form>`;
}

export function syncPublication(form, source) {
  if (form.classList.contains('pub-redeem')) return syncRedeemForm(form, source);
  const el = (name) => form.elements.namedItem(name);
  const changed = [source];
  if (['scheduleMinutes', 'scheduleHours', 'scheduleExtraMinutes'].includes(source))
    changed.push('scheduleMinutes', 'scheduleHours', 'scheduleExtraMinutes');
  if (source === 'start') changed.push('deadline');
  if (source === 'deadlinePreset') changed.push('deadline');
  for (const name of changed.filter(Boolean)) {
    const control = el(name);
    control?.removeAttribute?.('aria-invalid');
    control?.closest?.('label')?.querySelector('.pub-field-error')?.remove();
  }
  const schedule = el('scheduleMinutes');
  const customFields = [el('scheduleHours'), el('scheduleExtraMinutes')];
  const custom = schedule.value === 'custom';
  form.querySelector('.pub-custom-duration').hidden = !custom;
  customFields.forEach((control) => {
    control.disabled = !custom;
  });
  const selectedMinutes = custom
    ? Number(customFields[0].value) * 60 + Number(customFields[1].value)
    : Number(schedule.value);
  const validDuration =
    !custom ||
    (customFields.every((control) => control.validity.valid) &&
      selectedMinutes >= 1 &&
      selectedMinutes <= 1440);
  el('end').value =
    el('start').value && validDuration
      ? localTime(Date.parse(el('start').value) + selectedMinutes * 60000)
      : '';
  if (!custom) {
    customFields[0].value = Math.floor(selectedMinutes / 60);
    customFields[1].value = selectedMinutes % 60;
  }
  if (source === 'scheduleMinutes' && custom) customFields[0].focus();
  if (
    ['start', 'deadlinePreset'].includes(source) &&
    el('deadlinePreset').value !== 'custom' &&
    el('start').value
  )
    el('deadline').value = localTime(
      Date.parse(el('start').value) - Number(el('deadlinePreset').value) * 60000,
    );
  if (source === 'deadline') el('deadlinePreset').value = 'custom';
  form.querySelector('.pub-deadline-custom').hidden = el('deadlinePreset').value !== 'custom';
  const cutoffRule = { 0: '开始时截止', 60: '提前 1 小时', 1440: '提前 1 天' }[el('deadlinePreset').value];
  form.querySelector('#pub-deadline-text').textContent = el('deadline').value
    ? `${dateTime(el('deadline').value)}${cutoffRule ? ' · ' + cutoffRule : ''}`
    : '请选择报名截止时间';
  const range = (Date.parse(el('end').value) - Date.parse(el('start').value)) / 60000;
  form.querySelector('#pub-end-text').textContent = el('end').value
    ? `${dateTime(el('end').value)} 结束`
    : '请填写开始时间和服务时长';
  const original = form.dataset.originalPlan ? JSON.parse(form.dataset.originalPlan) : null;
  const unchangedSchedule =
    original && original.start === el('start').value && original.end === el('end').value;
  const minutes = el('durationHours')
    ? Number(el('durationHours').value) * 60 + Number(el('durationMinutes').value)
    : unchangedSchedule
      ? Number(original.minutes)
      : range;
  el('minutes').value = Number.isFinite(minutes) ? minutes : '';
  form.querySelector('#pub-duration-text').textContent =
    minutes > 0 ? `${hours(minutes)} 小时` : '请核对时间';
  if (source === 'category') el('description').placeholder = samples[el('category').value] || samples.其他;
  if (form.querySelector('#pub-contact-text'))
    form.querySelector('#pub-contact-text').textContent =
      `${el('contact').value || '请补充联系人'} · ${el('phone').value || '请补充电话'}`;
  if (source === 'address') {
    el('place').value = '';
    el('lat').value = '';
    el('lng').value = '';
    form.querySelector('#pub-place-name').textContent = el('address').value || '选择服务地点';
    form.querySelector('#pub-place-address').textContent = el('region').value || '可点击核对地图位置';
  }
  if (source === 'region' && !el('place').value)
    form.querySelector('#pub-place-address').textContent = el('region').value || '可点击核对地图位置';
}
export function publicationData(form) {
  syncPublication(form);
  const b = Object.fromEntries(new FormData(form));
  if (form.classList.contains('pub-redeem')) {
    delete b.coverFile;
    delete b.redemptionHours;
    return { ...b, minutes: redeemMinutes(form), offerType: 'goods' };
  }
  b.place = b.place ? JSON.parse(b.place) : null;
  for (const key of [
    'deadlinePreset',
    'scheduleMinutes',
    'scheduleHours',
    'scheduleExtraMinutes',
    'durationHours',
    'durationMinutes',
    'coverFile',
  ])
    delete b[key];
  return b;
}
export function validatePublication(form, old) {
  if (form.dataset.uploading) return false;
  form.querySelectorAll('.pub-field-error').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  if (form.classList.contains('pub-redeem')) return validateRedeemForm(form);
  const b = publicationData(form),
    errors = [];
  const custom = form.elements.scheduleMinutes.value === 'custom';
  const customMinutes =
    Number(form.elements.scheduleHours.value) * 60 + Number(form.elements.scheduleExtraMinutes.value);
  const invalidCustom =
    custom &&
    (!form.elements.scheduleHours.validity.valid ||
      !form.elements.scheduleExtraMinutes.validity.valid ||
      customMinutes < 1 ||
      customMinutes > 1440);
  for (const input of form.querySelectorAll('input:not([type=hidden]),textarea,select')) {
    if (!input.validity.valid)
      errors.push([input.name, input.validity.valueMissing ? '请填写此项' : '请检查填写内容或数值范围']);
  }
  if (invalidCustom && !errors.some(([name]) => ['scheduleHours', 'scheduleExtraMinutes'].includes(name)))
    errors.push(['scheduleHours', '服务时长应为 1 分钟至 24 小时']);

  if (Date.parse(b.deadline) > Date.parse(b.start)) errors.push(['deadline', '报名截止不能晚于服务开始']);
  if (!old && Date.parse(b.start) <= Date.now()) errors.push(['start', '请选择未来的服务时间']);
  if (!old && Date.parse(b.deadline) <= Date.now()) errors.push(['deadline', '报名截止已过，请重新选择']);
  if (!invalidCustom && (!Number.isInteger(Number(b.minutes)) || b.minutes < 1 || b.minutes > 1440))
    errors.push([
      form.elements.durationHours ? 'durationHours' : 'scheduleMinutes',
      '服务时长应为 1 分钟至 24 小时',
    ]);
  if (!/^[+\d][\d\s()-]{5,29}$/.test(b.phone || '')) errors.push(['phone', '请填写有效的联系电话']);
  for (const [name, message] of errors) {
    const control = form.elements.namedItem(name);
    if (!control || control.getAttribute('aria-invalid')) continue;
    control.setAttribute('aria-invalid', 'true');
    if (name === 'deadline') {
      form.elements.deadlinePreset.value = 'custom';
      form.querySelector('.pub-deadline-custom').hidden = false;
    }
    control.closest('details')?.setAttribute('open', '');
    const note = document.createElement('span');
    note.className = 'pub-field-error';
    note.textContent = message;
    control.closest('label')?.append(note);
  }
  if (errors.length) {
    const first = form.elements.namedItem(errors[0][0]);
    first?.focus();
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  return true;
}
export function publicationPreview(b, user, old) {
  if (b.kind === 'redeem') return `<div class="pub-preview"><p class="pub-preview-label">志愿者看到的兑换内容</p>${redeemSummary(b, user.name)}${old ? '<p class="pub-help">已有预约的核心内容变更需要参与者确认。</p>' : ''}${btn('返回继续编辑', 'close', '', 'secondary wide')}</div>`;
  const keys = [
    ['title', '服务标题'],
    ['description', '服务内容'],
    ['start', '开始时间'],
    ['end', '结束时间'],
    ['address', '服务地址'],
    ['minutes', '服务时长'],
    ['capacity', '人数／名额'],
  ];
  const changes = old
    ? keys.filter(([k]) =>
        ['start', 'end'].includes(k)
          ? Date.parse(old[k]) !== Date.parse(b[k])
          : String(old[k] ?? '') !== String(b[k] ?? ''),
      )
    : [];
  return `<div class="pub-preview"><p class="pub-preview-label">志愿者看到的公开信息</p><article class="pub-preview-card"><span class="pub-category">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(user.name)}</p><p>${icon('pin')}${esc(b.address || b.region)}</p><p>${icon('calendar')}${dateTime(b.start)} — ${dateTime(b.end)}</p><p>${icon('clock')}${hours(b.minutes)} 小时 · ${esc(b.capacity)} ${b.kind === 'redeem' ? '个预约名额' : '位志愿者'}</p><h4>服务内容</h4><p class="pre">${esc(b.description)}</p><p>报名截止：${dateTime(b.deadline)}</p></article><p class="pub-help">服务地点公开用于路线规划；联系人电话不在公开预览中展示。</p>${changes.length ? `<details class="pub-changes"><summary>本次修改 ${changes.length} 项 · 仅自己可见</summary>${changes.map(([key, title]) => `<div><strong>${title}</strong><p>原：${esc(old[key])}</p><p>现：${esc(b[key])}</p></div>`).join('')}</details>` : ''}${old ? '<p class="pub-help">已有参与者的核心安排变更将发送确认；在确认完成前保留原安排。</p>' : ''}${btn('返回继续编辑', 'close', '', 'secondary wide')}</div>`;
}
