import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';

test('profile contact editing persists without changing login identity; invalid input leaves stored data intact', (t) => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  const { auth, domain, store } = server.context;
  t.after(() => store.close());
  const { user } = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
  const updated = domain.profile(user, { ...user, name: '林小暖', contactPhone: '13912345678', region: '西湖区、上城区', skills: '陪伴交流', phone: '13999999999', role: 'requester' });
  assert.equal(store.user(user.id).contactPhone, '13912345678');
  assert.equal(store.user(user.id).phone, user.phone);
  assert.equal(store.user(user.id).role, 'volunteer');
  assert.throws(() => domain.profile(updated, { ...updated, contactPhone: '无效号码' }), /有效的联系电话/);
  assert.equal(store.user(user.id).contactPhone, '13912345678');
  const settings = domain.profile(updated, { ...updated, settings: { fontSize: 'large', notifications: false } });
  assert.equal(settings.contactPhone, '13912345678');
  assert.equal(auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' }).user.settings.fontSize, 'large');
});
