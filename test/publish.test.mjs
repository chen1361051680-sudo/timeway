import test from 'node:test';
import assert from 'node:assert/strict';
import transform from 'coordtransform';
import { createTimewayServer } from '../server.mjs';
import { cellFor } from '../src/common.mjs';
import { normalizePlace } from '../src/place.mjs';
import { publicationPreview, newPublication } from '../public/publish.js';

test('百度选址保存原始点供编辑，归一化后沿用已有网格；私有地点不进入公开列表', (t) => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  const { auth, domain: d } = server.context;
  const user = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
  const vol = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' }).user;
  const org = d.profile(user, {
    ...user,
    contact: '社区联系人',
    address: '社区服务中心',
    contactPhone: '13912345678',
  });
  const [lng, lat] = transform.gcj02tobd09(...transform.wgs84togcj02(120.15, 30.25));
  const place = {
    name: '测试医院',
    address: '私人位置301',
    city: '杭州市',
    district: '西湖区',
    lng,
    lat,
    coordinateSystem: 'bd09',
    untrusted: 'ignored',
  };
  const input = {
    ...newPublication('help', org),
    title: '地图选址测试',
    description: '公益服务',
    recipient: '测试对象',
    address: place.address,
    place,
    status: 'published',
  };
  const task = d.createTask(org, input);
  assert.ok(Math.abs(task.lat - 30.25) < 0.0001);
  assert.ok(Math.abs(task.lng - 120.15) < 0.0001);
  assert.equal(task.cell, cellFor(30.25, 120.15));
  assert.equal(task.phone, org.contactPhone);
  assert.equal(task.place.coordinateSystem, 'bd09');
  assert.equal(task.place.untrusted, undefined);
  const publicTask = d.taskView(vol, server.context.store.get('task', task.id));
  for (const key of ['place', 'lat', 'lng', 'address', 'recipient', 'phone'])
    assert.equal(publicTask[key], undefined);
  const preview = publicationPreview(input, org, null);
  assert.ok(!preview.includes('私人位置301'));
  assert.ok(!preview.includes(org.contactPhone));
  const app = d.apply(vol, task.id, {});
  d.applicationAction(org, app.id, { action: 'accept' });
  const edited = d.saveTask(org, task.id, {
    ...input,
    revision: task.revision,
    place: { ...place, lng: lng + 0.01 },
  });
  assert.equal(edited.hasPendingChange, true);
  assert.equal(edited.place.lng, lng);
  assert.equal(edited.pending.proposed.place.lng, lng + 0.01);
});

test('选址数据拒绝未知坐标类型与无效点；过期草稿不能直接发布', (t) => {
  for (const value of [
    [],
    {},
    { coordinateSystem: 'wgs84' },
    { coordinateSystem: 'bd09', lat: null, lng: 120 },
    { coordinateSystem: 'bd09', lat: 90, lng: 120 },
  ])
    assert.throws(() => normalizePlace(value));
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  const { auth, domain: d } = server.context;
  const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
  const start = new Date(Date.now() - 86400000).toISOString();
  const core = d.createTask(org, {
    ...newPublication('help', org),
    title: '核心信息即可发布',
    description: '陪伴聊天',
    address: '社区服务站',
    status: 'published',
  });
  assert.equal(core.recipient, '');
  assert.equal(core.status, 'published');
  const draft = d.createTask(org, {
    ...newPublication('help', org),
    title: '过期草稿',
    description: '测试',
    recipient: '测试',
    address: '测试地点',
    start,
    end: new Date(Date.parse(start) + 3600000).toISOString(),
    deadline: start,
    status: 'draft',
  });
  assert.throws(() => d.saveTask(org, draft.id, { ...draft, status: 'published' }), /晚于当前时间/);
  assert.equal(server.context.store.get('task', draft.id).status, 'draft');
});
