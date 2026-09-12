import { esc, icon, btn, hours, field } from './ui.js';

const accountSection = (symbol, title, description, content) =>
  `<section class="account-section"><div class="account-section-title">${icon(symbol)}<div><h3>${title}</h3><p>${description}</p></div></div>${content}</section>`;

export function profileEditor(user) {
  const requester = user.role === 'requester';
  return `<div class="account-intro"><span class="account-intro-icon">${icon(requester ? 'building' : 'user')}</span><div><h3>${requester ? '让志愿者认识你的机构' : '让社区更了解你'}</h3><p>完善联系信息，让每一次帮助顺利相遇</p></div></div>
    ${accountSection(
      'user',
      '基本资料',
      '用于服务联系与身份展示',
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
        ),
    )}
    ${accountSection(
      'map',
      requester ? '机构服务信息' : '服务意愿',
      '帮助双方找到合适的服务安排',
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
              'maxlength="200" placeholder="例如：陪伴交流、数字助老、陪诊协助"',
            )),
    )}
    <p class="account-footnote">${icon('info')}<span>账号手机号：${esc(user.phone)}<br>当前身份：${requester ? '需求方' : '志愿者'}</span></p>`;
}

export function accountSettings(user) {
  const requester = user.role === 'requester';
  const large = user.settings?.fontSize === 'large';
  const row = (symbol, title, sub, action) =>
    btn(
      `<span class="account-row-icon">${icon(symbol)}</span><span class="account-row-copy"><strong>${title}</strong><small>${sub}</small></span>${icon('arrow')}`,
      action,
      '',
      'account-link-row',
    );
  return `<div class="account-intro"><span class="account-intro-icon">${icon(requester ? 'building' : 'user')}</span><div><h3>${esc(user.name)}</h3><p>${requester ? '需求方' : '志愿者'} · ${esc(user.phone)}</p></div></div>
    <section class="account-section"><h3 class="account-group-label">显示与提醒</h3>
      <label class="account-setting-row"><span class="account-row-copy"><strong>文字大小</strong><small>选择适合自己的阅读大小</small></span><select name="fontSize" aria-label="文字大小"><option value="normal" ${!large ? 'selected' : ''}>标准</option><option value="large" ${large ? 'selected' : ''}>大字</option></select></label>
      <div class="account-font-preview"><span>阅读预览</span><p>让每一份善意，都被温柔看见</p></div>
      <label class="account-setting-row"><span class="account-row-copy"><strong>服务提醒</strong><small>接收服务安排与时间账户提醒</small></span><span class="account-toggle"><input type="checkbox" role="switch" aria-label="开启服务提醒" name="notifications" ${user.settings?.notifications !== false ? 'checked' : ''}><span aria-hidden="true"></span></span></label>
      <p class="account-inline-note">报名结果、时长入账等业务消息仍可在“我的消息”查看。</p>
    </section>
    <section class="account-section account-link-group"><h3 class="account-group-label">资料与隐私</h3>
      ${row('user', '编辑资料', '更新联系信息与服务意愿', 'edit-profile')}
      ${row('info', '使用说明与隐私约定', '了解服务规则与信息使用方式', 'terms')}
      <details class="account-location-note"><summary><span class="account-row-icon">${icon('locate')}</span><span class="account-row-copy"><strong>定位说明</strong><small>用于查找附近的爱心需求</small></span>${icon('chevron')}</summary><p>进入爱心地图时会申请定位权限。你可以拒绝授权，并手动选择地区；公共地图仅展示概略服务位置。定位权限可在浏览器的网站设置中管理。</p></details>
    </section>
    ${btn('退出登录', 'logout', '', 'account-logout')}`;
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
      <img class="profile-photo" src="/images/profile-avatar.png" width="148" height="148" alt="志愿者默认头像">
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
