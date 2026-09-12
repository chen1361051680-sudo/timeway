import { esc, icon, btn, hours, field } from './ui.js';

export function profileEditor(user) {
  const requester = user.role === 'requester';
  return (
    '<section class="account-section profile-editor-fields">' +
    field(
      'name',
      requester ? '机构名称' : '姓名',
      user.name,
      'text',
      true,
      'maxlength="80" autocomplete="name"',
    ) +
    (requester ? field('contact', '机构联系人', user.contact, 'text', true, 'maxlength="80"') : '') +
    field(
      'contactPhone',
      '联系电话',
      user.contactPhone || user.phone,
      'tel',
      true,
      'maxlength="30" autocomplete="tel"',
    ) +
    field(
      'region',
      '常用服务区域',
      user.region,
      'text',
      true,
      'maxlength="100" placeholder="例如：杭州市西湖区"',
    ) +
    (requester
      ? field(
          'address',
          '机构地址',
          user.address,
          'text',
          true,
          'maxlength="200" autocomplete="street-address"',
        )
      : field(
          'skills',
          '擅长服务',
          user.skills,
          'textarea',
          false,
          'maxlength="200" rows="2" placeholder="例如：陪伴交流、数字助老、陪诊协助"',
        )) +
    '</section>'
  );
}

export function accountSettings(user) {
  const large = user.settings?.fontSize === 'large';
  return (
    '<section class="account-section account-settings-card">' +
    '<label class="account-setting-row"><span class="account-row-copy"><strong>文字大小</strong></span><select name="fontSize" aria-label="文字大小"><option value="normal" ' +
    (!large ? 'selected' : '') +
    '>标准</option><option value="large" ' +
    (large ? 'selected' : '') +
    '>大字</option></select></label>' +
    '<label class="account-setting-row"><span class="account-row-copy"><strong>服务提醒</strong></span><span class="account-toggle"><input type="checkbox" role="switch" aria-label="开启服务提醒" name="notifications" ' +
    (user.settings?.notifications !== false ? 'checked' : '') +
    '><span aria-hidden="true"></span></span></label>' +
    btn(
      '<span class="account-row-copy"><strong>使用说明与隐私约定</strong></span>' + icon('arrow'),
      'terms',
      '',
      'account-link-row',
    ) +
    '</section>' +
    btn('退出登录', 'logout', '', 'account-logout')
  );
}

// Match the existing filled navigation icons with soft, two-tone card illustrations.
let glyphSerial = 0;
export function profileIcon(name) {
  const gradient = `profile-${name}-${++glyphSerial}`;
  const shapes = {
    pin: '<path d="M24 4c-9 0-16 7-16 16 0 11 16 25 16 25s16-14 16-25C40 11 33 4 24 4Z"/><circle cx="24" cy="19" r="6" fill="white"/>',
    heart: '<path d="M24 42 7 25C-5 10 13 0 24 13 35 0 53 10 41 25Z"/>',
    clock:
      '<circle cx="24" cy="24" r="20"/><path d="M24 12v13l9 5" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round"/>',
    map: '<path opacity=".85" d="m3 30 12-6 17 6 13-6v16l-13 6-17-6-12 6Z"/><path d="M24 2c-8 0-14 6-14 14 0 10 14 23 14 23s14-13 14-23C38 8 32 2 24 2Z" stroke="white" stroke-width="1.5"/><circle cx="24" cy="15" r="5" fill="white"/>',
    clipboard:
      '<rect x="8" y="7" width="33" height="39" rx="4"/><rect x="17" y="3" width="15" height="8" rx="3" stroke="white" stroke-width="2"/><path d="M16 19h17M16 26h17M16 33h12M16 39h9" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
    gift: '<rect x="4" y="22" width="40" height="22" rx="3"/><rect x="2" y="15" width="44" height="9" rx="3"/><path d="M24 16C5 17 6-2 16 5c4 3 8 11 8 11s4-8 8-11c10-7 11 12-8 11Zm0 1v28M3 24h42" fill="none" stroke="white" stroke-width="2.8"/>',
    message:
      '<path d="M8 5h32a5 5 0 0 1 5 5v25a5 5 0 0 1-5 5H17L3 47V10a5 5 0 0 1 5-5Z"/><path d="M13 17h22M13 27h16" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>',
    help: '<circle cx="24" cy="24" r="21"/><path d="M18 17c0-9 17-9 13 1-2 5-7 4-7 11m0 6v1" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round"/>',
    user: '<circle cx="24" cy="13" r="9"/><path d="M6 45v-5a18 18 0 0 1 36 0v5Z"/>',
  };
  return `<svg class="profile-art" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--art-light, #ff977e)"/><stop offset="1" stop-color="var(--art-dark, #ff4338)"/></linearGradient></defs><g fill="url(#${gradient})">${shapes[name] || shapes.clock}</g></svg>`;
}

const settingsIcon =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3 1-1h4l1 1 1 2 3 1 1 3 2 2v3l-2 2-1 3-3 1-1 2h-5l-1-2-3-1-1-3-2-2v-3l2-2 1-3 3-1Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="4"/></svg>';

export function volunteerProfile(user, summary, bank) {
  const available = bank.accounts.reduce((sum, account) => sum + account.available, 0);
  const stat = (art, label, value, unit, action, id = '') =>
    btn(
      `<span class="profile-stat-art">${profileIcon(art)}</span><span class="profile-stat-copy"><span>${label}</span><span class="profile-stat-number"><strong>${esc(value)}</strong><span>${unit}</span>${icon('arrow')}</span></span>`,
      action,
      id,
      'profile-stat',
      `aria-label="${label} ${esc(value)} ${unit}"`,
    );
  const rows = [
    ['map', 'mint', '爱心足迹', '查看我参与点亮的地区与服务记录', 'footprints'],
    ['clipboard', 'blue', '帮扶记录', '查看我参与的所有服务任务', 'profile-history'],
    ['gift', 'orange', '兑换记录', '查看我申请的兑换服务及完成情况', 'my-bookings'],
    ['message', 'coral', '我的消息', '查看报名结果、服务提醒、时间入账等通知', 'notices'],
    ['help', 'purple', '帮助与反馈', '使用说明、常见问题与问题反馈', 'profile-help'],
  ];
  return `<header class="profile-cover">
    <h1>我的</h1><p class="profile-tagline">用行动温暖社区 让善意持续发生</p>
    ${btn(settingsIcon, 'settings', '', 'profile-settings', 'aria-label="设置"')}
    <p class="profile-cover-note">平凡的行动<br>也能点亮一座城</p>
  </header>
  <div class="profile-body">
    <section class="profile-card profile-identity" aria-label="个人资料">
      <img class="profile-photo" src="/images/profile-avatar.webp" width="148" height="148" alt="志愿者默认头像">
      <div class="profile-identity-content"><div class="profile-name-row"><h2>${esc(user.name)}</h2><span class="profile-role">${profileIcon('user')}志愿者</span>${btn(`编辑资料 ${icon('arrow')}`, 'edit-profile', '', 'profile-edit')}</div>
      <p>${icon('pin')}<span>常用服务区域：${esc(user.region || '待完善')}</span></p>
      <p>${icon('tag')}<span>擅长的服务：${esc(user.skills || '待完善')}</span></p></div>
    </section>
    <section class="profile-card profile-contribution" aria-labelledby="profile-contribution-title">
      <div class="profile-section-heading"><h2 id="profile-contribution-title">我的贡献</h2>${btn(`查看详情 ${icon('arrow')}`, 'footprints', '', 'profile-more')}</div>
      <div class="profile-stats">${stat('pin', '已点亮地点', summary.places, '个', 'footprints')}${stat('heart', '已完成服务', summary.services, '次', 'profile-history')}${stat('clock', '累计贡献时长', hours(summary.minutes), '小时', 'profile-bank', 'ledger')}</div>
    </section>
    <section class="profile-card profile-account" aria-labelledby="profile-account-title">
      <div class="profile-section-heading"><h2 id="profile-account-title"><span class="profile-account-title-icon">${profileIcon('clock')}</span>我的时间账户</h2>${btn(`查看时间银行 ${icon('arrow')}`, 'profile-bank', '', 'profile-bank-link')}</div>
      <div class="profile-account-body"><span class="profile-account-art">${profileIcon('clock')}</span><div class="profile-balance"><div>可用时间 ${btn(icon('help-circle'), 'profile-balance-help', '', 'profile-balance-help', 'aria-label="可用时间说明"')}</div>${btn(`<strong>${hours(available)}</strong><span>小时</span>`, 'profile-bank', '', 'profile-balance-number')}</div><p>用时间传递温暖<br>让善意持续循环</p></div>
    </section>
    <section class="profile-card profile-menu" aria-label="个人服务入口">${rows.map(([art, color, title, description, action]) => btn(`<span class="profile-menu-art ${color}">${profileIcon(art)}</span><span class="profile-menu-copy"><strong>${title}</strong><span>${description}</span></span>${icon('arrow')}`, action, '', 'profile-menu-row')).join('')}</section>
  </div>`;
}
