// Isolated, development-only visual fixtures. Never persisted to the application database.
export function seedHall(server) {
  const { store: s, domain: d, auth } = server.context;
  if (server.context.environment !== 'test') throw new Error('服务大厅样例仅用于独立测试环境');
  const session = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
  const definitions = [
    ['陪伴聊天', '陪伴交流', '西湖社区居家养老服务中心', '西湖区 · 文新街道', 120, 2, 14],
    ['陪诊协助', '陪诊协助', '杭州市第一人民医院志愿服务队', '上城区 · 市一医院', 180, 1, 9],
    ['居家清洁整理', '生活协助', '拱墅区社区服务中心', '拱墅区 · 大关街道', 120, 3, 10],
    ['陪同散步', '出行陪同', '上城区邻里互助服务站', '上城区 · 望江街道', 90, 2, 15],
  ];
  const tasks = definitions.map(([title, category, name, region, minutes, capacity, hour], i) => {
    const org = {
      id: `hall-org-${i}`,
      phone: `1390000000${i}`,
      role: 'requester',
      name,
      region,
      contact: '测试联系人',
      address: '测试机构',
      profileComplete: true,
    };
    s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(org.id, org.phone, org.role, JSON.stringify(org));
    const start = new Date(Date.now() + (i + 2) * 86400000);
    start.setHours(hour, 0, 0, 0);
    return d.createTask(org, {
      kind: 'help',
      title,
      category,
      description: '仅用于隔离测试环境的服务大厅视觉与交互验证。',
      recipient: '测试受助对象',
      region,
      address: '不可公开的测试私人门牌301',
      start: start.toISOString(),
      end: new Date(+start + minutes * 60000).toISOString(),
      deadline: start.toISOString(),
      minutes,
      capacity,
      status: 'published',
    });
  });
  const org = s.user('hall-org-0');
  for (let i = 0; i < 2; i++) {
    const start = new Date(Date.now() + (i + 10) * 86400000).toISOString();
    const t = d.createTask(org, {
      ...s.get('task', tasks[0].id),
      title: `后续陪伴服务${i + 1}`,
      start,
      end: new Date(Date.parse(start) + 7200000).toISOString(),
      deadline: start,
    });
    d.apply(session.user, t.id, { message: '测试参与' });
  }
  const routes = new Map(
    tasks.map((t, i) => [
      t.id,
      {
        distance: [1.2, 3.5, 2.8, 4.1][i],
        minutes: [15, 25, 20, 30][i],
        returnMinutes: [15, 25, 20, 30][i],
        mode: ['driving', 'transit', 'driving', 'bus'][i],
      },
    ]),
  );
  return { session, tasks, routes };
}
