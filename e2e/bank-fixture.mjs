// All visual/example data stays in a throwaway test SQLite database.
export function seedBank(server) {
  if (server.context.environment !== 'test') throw new Error('时间银行样例仅用于隔离测试环境');
  const { store: s, domain: d, auth } = server.context;
  const session = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
  const vol = session.user;
  function organization(id, name, phone) {
    const org = {
      id,
      name,
      phone,
      role: 'requester',
      region: '西湖区',
      contact: '测试联系人',
      address: '测试机构',
      profileComplete: true,
    };
    s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, phone, org.role, JSON.stringify(org));
    return org;
  }
  const org = organization('bank-org', '西湖社区', '13900001111');
  const other = organization('bank-other', '拱墅区社区服务中心', '13900002222');
  let offset = 1;
  function makeTask(owner, values = {}) {
    const start = new Date(Date.now() + offset++ * 86400000);
    start.setHours(9, 0, 0, 0);
    const minutes = values.minutes || 120;
    return d.createTask(owner, {
      kind: 'redeem',
      title: '上门陪伴聊天',
      category: '陪伴交流',
      description: '上门陪伴独居老人聊天交流，给予情感陪伴。',
      recipient: '本人或家中老人',
      region: '西湖区 · 文新街道',
      address: '不可公开的测试私人门牌301',
      start: start.toISOString(),
      end: new Date(+start + minutes * 60000).toISOString(),
      deadline: start.toISOString(),
      minutes,
      capacity: 3,
      status: 'published',
      ...values,
    });
  }
  function contribute(minutes, confirm = true) {
    const t = makeTask(org, { kind: 'help', minutes });
    const a = d.apply(vol, t.id, {});
    d.applicationAction(org, a.id, { action: 'accept' });
    const end = new Date(Date.now() - offset * 86400000).toISOString();
    const past = {
      ...s.get('task', t.id),
      start: new Date(Date.parse(end) - minutes * 60000).toISOString(),
      end,
    };
    s.put('task', past);
    d.applicationAction(vol, a.id, {
      action: 'submit',
      start: past.start,
      end,
      rest: 0,
      content: '隔离测试：完成陪伴服务',
      note: '隔离测试：补录服务记录',
    });
    if (confirm) d.recordAction(org, a.id, { action: 'confirm', minutes, recipients: 1 });
  }
  for (let i = 0; i < 8; i++) contribute(22 * 60);
  contribute(8 * 60, false);
  const consent = { recipient: '本人', phone: vol.phone, consent: true };
  function finish(task, minutes) {
    const booking = d.book(vol, task.id, consent);
    d.bookingAction(org, booking.id, { action: 'accept' });
    s.put('booking', {
      ...s.get('booking', booking.id),
      start: new Date(Date.now() - 86400000).toISOString(),
    });
    const oldTask = s.get('task', task.id);
    s.put('task', { ...oldTask, start: new Date(Date.now() - 86400000).toISOString() });
    d.bookingAction(org, booking.id, {
      action: 'result',
      minutes,
      recipients: 1,
      content: '隔离测试：完成预约服务',
    });
    d.bookingAction(vol, booking.id, { action: 'complete' });
    return booking;
  }
  for (let i = 0; i < 4; i++) finish(makeTask(org, { minutes: 17 * 60 }), 17 * 60);
  const heldTask = makeTask(org, { title: '已预约的社区照护', minutes: 12 * 60, capacity: 1 });
  const held = d.book(vol, heldTask.id, consent);
  s.put('task', { ...s.get('task', heldTask.id), start: new Date(Date.now() - 60000).toISOString() });
  const tasks = [
    makeTask(org),
    makeTask(org, {
      title: '陪同就医',
      category: '陪诊协助',
      description: '协助老年人就医，提供取号、陪诊、取药等帮助。',
      region: '上城区 · 市一医院',
      minutes: 180,
      capacity: 2,
    }),
    makeTask(org, {
      title: '居家清洁整理',
      category: '生活协助',
      description: '协助老人进行居家清洁与物品整理，营造整洁舒适的居住环境。',
      region: '拱墅区 · 大关街道',
      capacity: 4,
    }),
    makeTask(org, {
      title: '陪同散步',
      category: '出行陪同',
      description: '陪伴老人走进户外，享受轻松温暖的午后时光。',
      region: '上城区 · 望江街道',
      minutes: 90,
      capacity: 3,
    }),
    makeTask(other, { title: '邻里陪伴服务', minutes: 60 }),
  ];
  return { session, org, other, tasks, held, heldTask, makeTask, finish, consent };
}
