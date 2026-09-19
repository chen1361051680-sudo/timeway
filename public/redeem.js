import { esc, icon, hours, status, dateTime, link } from './ui.js';

export const isGoods = (offer) => offer.offerType === 'goods';
export const isUnscheduledGoods = (offer) => isGoods(offer) && !offer.start;
export const offerCover = (offer) => offer.coverId ? `/api/offer-covers/${encodeURIComponent(offer.coverId)}` : '';
export function offerImage(offer, className = '') {
  const url = offerCover(offer);
  return url ? `<img class="${className}" src="${url}" alt="${esc(offer.itemName || offer.title)}" loading="lazy">` : `<span class="offer-image-empty ${className}" aria-hidden="true">${icon('gift')}</span>`;
}

export function redeemForm(t, user, old) {
  return `<form id="publish-form" class="publish-form pub-simple pub-stream pub-redeem" novalidate>
    <p class="form-error" role="alert"></p>
    <section class="pub-card">
      <h2 class="pub-arrange-heading">${icon('gift')}物品信息</h2>
      <label class="field pub-subject"><span id="offer-name-label">物品名称</span><input name="itemName" aria-labelledby="offer-name-label" value="${esc(t.itemName || t.title)}" required maxlength="100" placeholder="例如：大米"></label>
      <div class="offer-cover-field">
        <span id="offer-cover-label">物品图片</span>
        <div class="offer-cover-row"><label class="offer-cover-picker"><input type="file" name="coverFile" aria-labelledby="offer-cover-label" aria-describedby="offer-cover-note" accept="image/jpeg,image/png,image/webp"><span class="offer-cover-preview">${t.coverId ? offerImage(t) : icon('plus')}</span><span class="offer-cover-caption">${t.coverId ? '更换图片' : '上传物品图片'}</span></label><button type="button" class="text-button" data-action="remove-offer-cover" ${t.coverId ? '' : 'hidden'}>删除图片</button></div>
        <input type="hidden" name="coverId" value="${esc(t.coverId)}">
        <p id="offer-cover-note" class="offer-cover-note" role="status">JPG、PNG、WebP，最多 3 MB</p>
      </div>
      <label class="field pub-subject"><span id="offer-title-label">标题</span><input name="title" aria-labelledby="offer-title-label" value="${esc(t.title)}" required maxlength="100" placeholder="例如：社区爱心好米一袋"></label>
      <label class="field pub-subject"><span id="offer-spec-label">规格</span><input name="specification" aria-labelledby="offer-spec-label" value="${esc(t.specification)}" required maxlength="200" placeholder="例如：5kg／袋，每份 1 袋"></label>
      <label class="field offer-duration"><span id="offer-duration-label">${icon('clock')}兑换所需时长</span><span class="offer-duration-input"><input name="redemptionHours" aria-labelledby="offer-duration-label" type="number" value="${esc((t.minutes ?? 60) / 60)}" required min="0.016666666666666666" max="24" step="any" inputmode="decimal" placeholder="例如：1.5"><span>小时</span></span></label>
      <p class="offer-field-note" id="offer-duration-note"></p>
    </section>
    <div class="pub-actions"><p class="pub-submit-status" role="status"></p><div><button class="primary" type="submit">${old ? '预览并保存修改' : '预览并发布'}</button></div></div>
  </form>`;
}

export function redeemMinutes(form) {
  const minutes = Number(form.elements.redemptionHours.value) * 60;
  const rounded = Math.round(minutes);
  return Number.isFinite(minutes) && rounded >= 1 && rounded <= 1440 && Math.abs(minutes - rounded) < 1e-8 ? rounded : null;
}

export function syncRedeemForm(form, source) {
  const control = form.elements.namedItem(source || 'redemptionHours');
  control?.removeAttribute('aria-invalid');
  control?.removeAttribute('aria-describedby');
  control?.closest('label')?.querySelector('.pub-field-error')?.remove();
  const minutes = redeemMinutes(form);
  form.querySelector('#offer-duration-note').textContent = minutes !== null ? `每份需要 ${hours(minutes)} 小时时间权益` : '例如 0.5、1 或 1.5 小时，最多 24 小时';
}

export function validateRedeemForm(form) {
  let first;
  for (const input of form.querySelectorAll('input:not([type="hidden"])')) {
    input.removeAttribute('aria-describedby');
    const valid = input.validity.valid && (!input.required || input.value.trim().length > 0) && (input.name !== 'redemptionHours' || redeemMinutes(form) !== null);
    if (valid) continue;
    input.setAttribute('aria-invalid', 'true');
    const note = document.createElement('span');
    note.className = 'pub-field-error';
    note.id = `offer-${input.name}-error`;
    input.setAttribute('aria-describedby', note.id);
    note.textContent = input.name === 'redemptionHours' ? '请填写有效的小时数，例如 0.5、1 或 1.5（最多 24 小时）' : input.name === 'coverFile' ? input.validationMessage : '请填写此项';
    input.closest('label').append(note);
    first ||= input;
  }
  first?.focus();
  return !first;
}

function renderCoverField(form) {
  const coverId = form.elements.coverId.value;
  const area = form.querySelector('.offer-cover-field');
  area.querySelector('.offer-cover-preview').innerHTML = coverId ? offerImage({ coverId, itemName: form.elements.itemName.value }) : icon('plus');
  area.querySelector('.offer-cover-caption').textContent = coverId ? '更换图片' : '上传物品图片';
  area.querySelector('[data-action="remove-offer-cover"]').hidden = !coverId && !form.elements.coverFile.value;
}

export function removeRedeemCover(form) {
  if (form.dataset.uploading || form.dataset.saving) return;
  form.elements.coverId.value = '';
  form.elements.coverFile.value = '';
  form.elements.coverFile.setCustomValidity('');
  syncRedeemForm(form, 'coverFile');
  form.querySelector('#offer-cover-note').textContent = 'JPG、PNG、WebP，最多 3 MB';
  renderCoverField(form);
}

export async function uploadRedeemCover(form, api) {
  const input = form.elements.coverFile;
  const file = input.files[0];
  if (!file || form.dataset.uploading) return;
  input.setCustomValidity('');
  renderCoverField(form);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 3 * 1024 * 1024) throw new Error('图片不能超过 3 MB');
  form.dataset.uploading = '1';
  const area = form.querySelector('.offer-cover-field');
  area.setAttribute('aria-busy', 'true');
  const controls = [input, area.querySelector('button'), form.querySelector('button[type="submit"]')];
  controls.forEach((control) => { control.disabled = true; });
  form.querySelector('#offer-cover-note').textContent = '正在上传图片…';
  try {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
      reader.readAsDataURL(file);
    });
    const cover = await api('/offer-covers', 'POST', { content }, undefined, AbortSignal.timeout(20000));
    if (!form.isConnected) return;
    form.elements.coverId.value = cover.id;
    renderCoverField(form);
    form.querySelector('#offer-cover-note').textContent = '图片已上传，可点击更换';
  } finally {
    delete form.dataset.uploading;
    area.removeAttribute('aria-busy');
    controls.forEach((control) => { control.disabled = false; });
  }
}

export function redeemSummary(t, orgName) {
  return `<article class="offer-summary">
    ${t.coverId ? offerImage(t, 'offer-detail-cover') : ''}
    <div class="offer-summary-body"><span class="offer-kind">${icon('gift')}物品兑换</span><h1>${esc(t.title)}</h1><p class="offer-org">${esc(orgName)}</p><div class="offer-price"><strong>${hours(t.minutes)}</strong><span>小时 / 份</span></div></div>
  </article><section class="card offer-section"><h2>${icon('clipboard')}物品信息</h2><dl><dt>物品名称</dt><dd>${esc(t.itemName || t.title)}</dd><dt>规格</dt><dd>${esc(t.specification)}</dd><dt>兑换所需时长</dt><dd>${hours(t.minutes)} 小时</dd></dl></section>`;
}

export function redeemDetail(t, changes, action) {
  const currentStatus = t.displayStatus || t.status;
  const badge = currentStatus === 'published' ? '<span class="badge status-published">可兑换</span>' : status(currentStatus);
  return `${redeemSummary(t, t.orgName)}<div class="offer-detail-state">${badge}</div>${changes}
    ${t.cancelReason ? `<p class="notice">${esc(t.cancelReason)}</p>` : ''}<div class="sticky-actions actions">${action}</div>`;
}

export function instantRedemptionDetail(b, org) {
  return `${org ? '' : `<section class="card redemption-success" role="status"><span class="redemption-check">${icon('check')}</span><h1>兑换成功</h1><p>请等待工作人员联系你</p></section>`}
    <section class="card offer-section redemption-info"><h2>${icon('gift')}兑换物品</h2>${b.coverId ? offerImage(b, 'redemption-cover') : ''}<h3>${esc(b.title)}</h3><dl><dt>物品名称</dt><dd>${esc(b.itemName)}</dd><dt>规格</dt><dd>${esc(b.specification)}</dd><dt>扣除时长</dt><dd>${hours(b.charged)} 小时</dd><dt>提供机构</dt><dd>${esc(b.orgName)}</dd><dt>兑换时间</dt><dd>${dateTime(b.completedAt)}</dd></dl></section>
    <section class="card offer-section redemption-contact"><h2>${icon('user')}申请人信息</h2><dl><dt>申请人</dt><dd>${esc(b.recipient)}</dd><dt>联系电话</dt><dd><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></dd></dl>${org ? `<a class="primary redemption-call" href="tel:${esc(b.phone)}">${icon('phone')}联系申请人</a>` : ''}</section>
    ${b.task.status === 'deleted' ? '' : `<div class="actions">${link('查看兑换物品', `task/${b.taskId}`, 'text-button')}</div>`}`;
}
