import { esc, icon, field, select, categories, localTime, dateTime, hours, btn } from './ui.js';

const samples = {
  陪伴交流: '例如：陪老人聊天、读报，了解近期生活情况。',
  生活协助: '例如：整理生活用品、协助采购，说明具体工作范围。',
  出行陪同: '例如：陪同前往社区活动，说明出发地与目的地。',
  陪诊协助: '例如：协助挂号、取药和院内陪同，说明就诊科室。',
  数字助老: '例如：指导使用手机挂号、视频通话，说明设备与学习内容。',
  其他: '请说明需要做什么、服务流程和必要准备。',
};
export function newPublication(kind, user) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  return {
    kind,
    category: categories[0],
    region: user.region,
    address: user.address,
    contact: user.contact || user.name,
    phone: user.contactPhone || user.phone,
    capacity: 1,
    recipients: 1,
    minutes: 60,
    start: start.toISOString(),
    end: new Date(+start + 3600000).toISOString(),
    deadline: start.toISOString(),
  };
}
export function publishForm(t, user, old) {
  const redeem = t.kind === 'redeem';
  const rest = Math.max(0, Math.round((Date.parse(t.end) - Date.parse(t.start)) / 60000) - Number(t.minutes));
  const extraCount = [t.recipient, t.requirements, t.meeting, rest].filter(Boolean).length;
  return `<form id="publish-form" class="publish-form pub-simple" novalidate>
    ${old ? '<p class="pub-edit-note">编辑已有服务，安排变更仍需相关参与者确认。</p>' : ''}
    <p class="form-error" role="alert"></p>
    <section class="pub-card"><h2 class="pub-simple-heading">服务内容</h2>
      ${field('title', '服务标题', t.title, 'text', true, 'maxlength="100" placeholder="例如：陪社区长者聊天"')}
      ${select('category', '服务类型', categories, t.category || categories[0])}
      ${field('description', '具体服务内容', t.description, 'textarea', true, `maxlength="3000" rows="2" placeholder="${samples[t.category] || samples.其他}"`)}
    </section>
    <section class="pub-card"><h2 class="pub-simple-heading">时间与人数</h2>
      <div class="pub-time-grid">${field('start', '开始时间', localTime(t.start), 'datetime-local')}${field('end', '结束时间', localTime(t.end), 'datetime-local')}</div>
      <div class="pub-shortcuts" aria-label="快捷服务时段">${[60, 90, 120].map((m) => btn(`${hours(m)} 小时`, 'pub-duration', m, 'pub-chip')).join('')}<span id="pub-duration-text">${hours(t.minutes)} 小时</span></div>
      ${redeem ? `<div class="two-col">${field('durationHours', '兑换所需小时', Math.floor(t.minutes / 60), 'number', true, 'min="0" max="24" step="1"')}${field('durationMinutes', '另加分钟', t.minutes % 60, 'number', true, 'min="0" max="59" step="1"')}</div>` : ''}
      <input type="hidden" name="minutes" value="${esc(t.minutes)}">
      ${field('capacity', redeem ? '预约名额' : '志愿者人数', t.capacity, 'number', true, 'min="1" max="200" step="1"')}
    </section>
    <section class="pub-card"><h2 class="pub-simple-heading">服务地点</h2>
      <button type="button" class="pub-place-button" data-action="pub-place">${icon('pin')}<span><strong id="pub-place-name">${esc(t.place?.name || t.address || '选择服务地点')}</strong><small id="pub-place-address">${esc(t.place?.address || t.region || '搜索地址或地图选点')}</small></span>${icon('arrow')}</button>
      <input type="hidden" name="place" value="${esc(t.place ? JSON.stringify(t.place) : '')}"><input type="hidden" name="lat" value="${esc(t.lat)}"><input type="hidden" name="lng" value="${esc(t.lng)}">
      <details class="pub-address-details"><summary>手动填写地址</summary>
        ${field('address', '详细地址（仅相关人员可见）', t.address, 'text', true, 'maxlength="300" placeholder="填写服务地址"')}
        ${field('region', '公开区域（不含门牌）', t.region, 'text', true, 'maxlength="100" placeholder="例如：杭州市 · 西湖区"')}
        ${user.address ? btn('使用机构常用地址', 'pub-org-address', '', 'pub-address-reuse') : ''}
      </details>
      <p class="pub-simple-privacy">详细地址仅向相关人员展示。</p>
      <div class="pub-contact-summary"><span>${icon('user')}<span id="pub-contact-text">${esc(t.contact)} · ${esc(t.phone)}</span></span>${btn('修改', 'pub-more', 'contact', 'pub-text-button')}</div>
    </section>
    <details class="pub-card pub-more"><summary><strong>更多设置</strong><span>${extraCount ? '已有补充信息' : '按需填写'}</span></summary><div class="pub-more-body">
      ${select(
        'deadlinePreset',
        '报名截止设置',
        [
          ['0', '服务开始时'],
          ['60', '开始前 1 小时'],
          ['1440', '开始前 1 天'],
          ['custom', '自定义'],
        ],
        old ? 'custom' : '0',
      )}
      ${field('deadline', '报名截止', localTime(t.deadline), 'datetime-local')}
      ${!redeem ? field('restMinutes', '不计入时长（分钟）', rest || 0, 'number', false, 'min="0" max="1440" step="1"') : ''}
      ${field('recipient', '受助对象／适用人群', t.recipient, 'text', false, 'maxlength="300" placeholder="有需要时补充说明"')}
      ${field('recipients', '预计受助人数', t.recipients, 'number', false, 'min="1" max="10000" step="1"')}
      ${field('requirements', '服务要求', t.requirements, 'textarea', false, 'maxlength="500" rows="2"')}
      ${field('meeting', '集合和到达说明', t.meeting, 'textarea', false, 'maxlength="500" rows="2" placeholder="例如：小区东门集合，或补充楼栋门牌"')}
      ${field('contact', '机构联系人', t.contact, 'text', true, 'maxlength="80" autocomplete="name"')}
      ${field('phone', '联系电话', t.phone, 'tel', true, 'maxlength="30" autocomplete="tel"')}
      <p class="pub-simple-privacy">实际服务时长以完成后的核实记录为准。</p>
    </div></details>
    <div class="pub-actions"><div><button class="primary" name="mode" value="published">${old && old.status !== 'draft' ? '预览并保存修改' : '预览并发布'}</button>${!old || old.status === 'draft' ? '<button class="secondary" name="mode" value="draft" formnovalidate>保存草稿</button>' : ''}</div></div>
  </form>`;
}

export function syncPublication(form, source) {
  const el = (name) => form.elements.namedItem(name);
  const changed = [source];
  if (source === 'start') changed.push('end', 'deadline');
  if (source === 'deadlinePreset') changed.push('deadline');
  if (['start', 'end'].includes(source)) changed.push('restMinutes');
  for (const name of changed.filter(Boolean)) {
    const control = el(name);
    control?.removeAttribute('aria-invalid');
    control?.closest('label')?.querySelector('.pub-field-error')?.remove();
  }
  if (source === 'start' && form.dataset.previousStart && form.dataset.previousEnd) {
    const length = Date.parse(form.dataset.previousEnd) - Date.parse(form.dataset.previousStart);
    if (length > 0 && el('start').value) el('end').value = localTime(Date.parse(el('start').value) + length);
  }
  if (
    ['start', 'deadlinePreset'].includes(source) &&
    el('deadlinePreset').value !== 'custom' &&
    el('start').value
  )
    el('deadline').value = localTime(
      Date.parse(el('start').value) - Number(el('deadlinePreset').value) * 60000,
    );
  if (source === 'deadline') el('deadlinePreset').value = 'custom';
  const range = (Date.parse(el('end').value) - Date.parse(el('start').value)) / 60000;
  const minutes = el('restMinutes')
    ? range - Number(el('restMinutes').value || 0)
    : Number(el('durationHours').value) * 60 + Number(el('durationMinutes').value);
  el('minutes').value = Number.isFinite(minutes) ? minutes : '';
  form.querySelector('#pub-duration-text').textContent =
    minutes > 0 ? `${hours(minutes)} 小时` : '请核对时间';
  form.dataset.previousStart = el('start').value;
  form.dataset.previousEnd = el('end').value;
  if (source === 'category') el('description').placeholder = samples[el('category').value] || samples.其他;
  if (form.querySelector('#pub-contact-text'))
    form.querySelector('#pub-contact-text').textContent =
      `${el('contact').value || '请补充联系人'} · ${el('phone').value || '请补充电话'}`;
  if (source === 'address') {
    el('place').value = '';
    el('lat').value = '';
    el('lng').value = '';
    form.querySelector('#pub-place-name').textContent = el('address').value || '选择服务地点';
    form.querySelector('#pub-place-address').textContent = '文字地址 · 可点击核对地图位置';
  }
}
export function publicationData(form) {
  syncPublication(form);
  const b = Object.fromEntries(new FormData(form));
  b.place = b.place ? JSON.parse(b.place) : null;
  for (const key of ['deadlinePreset', 'durationHours', 'durationMinutes', 'restMinutes']) delete b[key];
  return b;
}
export function validatePublication(form, old) {
  form.querySelectorAll('.pub-field-error').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  const b = publicationData(form),
    errors = [];
  for (const input of form.querySelectorAll('input:not([type=hidden]),textarea,select')) {
    if (!input.validity.valid)
      errors.push([input.name, input.validity.valueMissing ? '请填写此项' : '请检查填写内容或数值范围']);
  }
  if (!(Date.parse(b.end) > Date.parse(b.start))) errors.push(['end', '结束时间必须晚于开始时间']);
  if (Date.parse(b.deadline) > Date.parse(b.start)) errors.push(['deadline', '报名截止不能晚于服务开始']);
  if ((!old || old.status === 'draft') && Date.parse(b.start) <= Date.now())
    errors.push(['start', '请选择未来的服务时间']);
  if ((!old || old.status === 'draft') && Date.parse(b.deadline) <= Date.now())
    errors.push(['deadline', '报名截止已过，请重新选择']);
  if (!Number.isInteger(Number(b.minutes)) || b.minutes < 1 || b.minutes > 1440)
    errors.push([
      form.elements.restMinutes ? 'restMinutes' : 'durationHours',
      '有效时长应为 1 分钟至 24 小时，请核对时间与休息部分',
    ]);
  if (!/^[+\d][\d\s()-]{5,29}$/.test(b.phone || '')) errors.push(['phone', '请填写有效的联系电话']);
  for (const [name, message] of errors) {
    const control = form.elements.namedItem(name);
    if (!control || control.getAttribute('aria-invalid')) continue;
    control.setAttribute('aria-invalid', 'true');
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
  const keys = [
    ['title', '服务标题'],
    ['description', '服务内容'],
    ['start', '开始时间'],
    ['end', '结束时间'],
    ['address', '服务地址'],
    ['meeting', '集合说明'],
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
  return `<div class="pub-preview"><p class="pub-preview-label">志愿者看到的公开信息</p><article class="pub-preview-card"><span class="pub-category">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(user.name)}</p><p>${icon('pin')}${esc(b.region)}</p><p>${icon('calendar')}${dateTime(b.start)} — ${dateTime(b.end)}</p><p>${icon('clock')}${hours(b.minutes)} 小时 · ${esc(b.capacity)} ${b.kind === 'redeem' ? '个预约名额' : '位志愿者'}</p><h4>服务内容</h4><p class="pre">${esc(b.description)}</p>${b.requirements ? `<h4>服务要求</h4><p class="pre">${esc(b.requirements)}</p>` : ''}<p>报名截止：${dateTime(b.deadline)}</p></article><p class="pub-help">详细门牌、受助对象和联系人电话不会出现在公开预览中。</p>${changes.length ? `<details class="pub-changes"><summary>本次修改 ${changes.length} 项 · 仅自己可见</summary>${changes.map(([key, title]) => `<div><strong>${title}</strong><p>原：${esc(old[key])}</p><p>现：${esc(b[key])}</p></div>`).join('')}</details>` : ''}${old && old.status !== 'draft' ? '<p class="pub-help">已有参与者的核心安排变更将发送确认；在确认完成前保留原安排。</p>' : ''}${btn('返回继续编辑', 'close', '', 'secondary wide')}</div>`;
}
