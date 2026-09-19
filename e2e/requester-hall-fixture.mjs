// Reference-shaped fixtures for isolated SQLite tests only.
export function seedRequesterHall(server) {
  if (server.context.environment !== 'test') throw new Error('需求方大厅样例仅用于隔离测试环境');
  const { store: s, domain: d, auth } = server.context;
  const session = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' });
  const org = session.user;
  let serial = 0;
  function volunteer() {
    const id = `requester-hall-vol-${++serial}`;
    const user = {
      id,
      role: 'volunteer',
      phone: `1391000${String(serial).padStart(4, '0')}`,
      name: `志愿者${serial}`,
      region: '杭州市',
      skills: '耐心陪伴、生活协助',
      profileComplete: true,
    };
    s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, user.phone, user.role, JSON.stringify(user));
    return user;
  }
  const definitions = [
    ['陪伴聊天', '陪伴交流', '西湖社区服务站', 120, 2, 14],
    ['陪诊协助', '陪诊协助', '上城区邻里中心', 180, 2, 9],
    ['生活帮助', '生活协助', '拱墅区社区服务中心', 120, 1, 10],
    ['上门探访', '出行陪同', '滨江区服务站', 90, 2, 15],
  ];
  const tasks = definitions.map(([title, category, region, minutes, capacity, hour], i) => {
    const start = new Date(Date.now() + (i + 2) * 86400000);
    start.setHours(hour, i === 0 ? 30 : 0, 0, 0);
    return d.createTask(org, {
      kind: 'help',
      title,
      category,
      region,
      minutes,
      capacity,
      start: start.toISOString(),
      end: new Date(+start + minutes * 60000).toISOString(),
      deadline: start.toISOString(),
      status: 'published',
      description: '隔离测试的帮扶需求',
      recipient: '测试受助对象',
      address: '测试私人门牌301',
      lat: 30.25,
      lng: 120.15,
    });
  });
  function apply(task, accepted = true) {
    const user = volunteer();
    const app = d.apply(user, task.id, { message: '愿意参加本次服务' });
    if (accepted) d.applicationAction(org, app.id, { action: 'accept' });
    return { user, app };
  }
  apply(tasks[0]);
  const pending = [apply(tasks[0], false), apply(tasks[0], false)];
  const medical = [apply(tasks[1]), apply(tasks[1])];
  const household = apply(tasks[2]);
  const walk = apply(tasks[3]);
  const withdrawal = apply(tasks[3]);
  d.applicationAction(withdrawal.user, withdrawal.app.id, {
    action: 'withdraw',
    reason: '临时有事无法参加，请补充人员',
  });
  function submit(task, participation, daysAgo, confirm = false) {
    const original = s.get('task', task.id);
    const end = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const start = new Date(Date.parse(end) - task.minutes * 60000).toISOString();
    s.put('task', { ...original, start, end });
    d.applicationAction(participation.user, participation.app.id, {
      action: 'submit',
      start,
      end,
      content: '已完成约定的陪伴与生活协助',
      note: '测试补录说明',
    });
    if (confirm)
      d.recordAction(org, participation.app.id, { action: 'confirm', minutes: task.minutes, recipients: 1 });
  }
  submit(tasks[2], household, 1);
  submit(tasks[3], walk, 3, true);
  return { session, org, tasks, pending, medical, household, withdrawal, volunteer, apply };
}
