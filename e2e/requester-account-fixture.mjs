// Only for isolated SQLite UI tests and local throwaway previews.
export function seedRequesterAccount(server) {
  if (server.context.environment !== 'test') throw new Error('机构页面样例仅用于隔离测试环境');
  const { domain: d, store: s, auth } = server.context;
  const session = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' });
  const org = d.profile(session.user, {
    ...session.user,
    name: '西湖社区服务中心',
    region: '浙江省 · 杭州市 · 西湖区',
    address: '西湖社区公共服务中心',
    contact: '社区联系人',
  });
  let index = 0;
  const people = [];
  function volunteer(name) {
    const id = `account-volunteer-${++index}`;
    const user = {
      id,
      name,
      phone: `1392000${String(index).padStart(4, '0')}`,
      role: 'volunteer',
      region: '西湖区',
      profileComplete: true,
      skills: '陪伴交流与生活协助',
    };
    s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, user.phone, user.role, JSON.stringify(user));
    people.push(user);
    return user;
  }
  function makeTask(title, category, minutes, i, kind = 'help') {
    const start = Date.now() + (i + 10) * 86400000;
    return d.createTask(org, {
      kind,
      title,
      category,
      minutes,
      capacity: 3,
      start: new Date(start).toISOString(),
      end: new Date(start + minutes * 60000).toISOString(),
      deadline: new Date(start).toISOString(),
      description: '测试环境：社区提供的公益服务',
      recipient: '测试受助者',
      region: '西湖区 · 社区服务站',
      address: '测试私人门牌301',
      status: 'published',
      lat: 30.25 + i * 0.01,
      lng: 120.15,
    });
  }
  const definitions = [
    ['林小暖', '陪伴聊天', '陪伴交流', 120],
    ['陈雨欣', '陪诊协助', '陪诊协助', 180],
    ['周晨', '生活帮助', '生活协助', 90],
    ['王宁', '上门探访', '出行陪同', 120],
    ['李小雨', '社区助老服务', '生活协助', 1080],
  ];
  const tasks = definitions.map(([name, title, category, minutes], i) => {
    const person = volunteer(name);
    const task = makeTask(title, category, minutes, i);
    const app = d.apply(person, task.id, {});
    d.applicationAction(org, app.id, { action: 'accept' });
    const end = new Date(Date.now() - (i + 2) * 86400000).toISOString();
    const past = {
      ...s.get('task', task.id),
      start: new Date(Date.parse(end) - minutes * 60000).toISOString(),
      end,
    };
    s.put('task', past);
    d.applicationAction(person, app.id, {
      action: 'submit',
      start: past.start,
      end,
      content: '已完成约定的帮扶服务',
      note: '隔离样例人工补录',
    });
    if (i < 4) {
      d.recordAction(org, app.id, { action: 'confirm', minutes, recipients: 1 });
      // Backdate only the test confirmation timestamp to exercise date filters.
      s.put('record', {
        ...s.get('record', app.id),
        confirmedAt: new Date(Date.now() - i * 86400000).toISOString(),
      });
    }
    return { ...past, recordId: app.id };
  });
  const offer = makeTask('社区陪伴服务', '陪伴交流', 60, 20, 'redeem');
  const bookings = people
    .slice(0, 2)
    .map((person) => d.book(person, offer.id, { recipient: '本人', phone: person.phone, consent: true }));
  d.bookingAction(org, bookings[1].id, { action: 'accept' });
  const draft = d.createTask(org, {
    ...s.get('task', offer.id),
    id: undefined,
    title: '待完善的兑换服务',
    status: 'draft',
  });
  d.notify(org.id, '新的服务记录已提交，请核实', `task/${tasks[4].id}/records/${tasks[4].recordId}`);
  return { session, org, people, tasks, offer, bookings, draft };
}
