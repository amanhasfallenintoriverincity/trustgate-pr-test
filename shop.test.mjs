import assert from 'node:assert/strict';
import test from 'node:test';
import { createShop } from './server.mjs';

async function shop(t) {
  const server = createShop();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, { session = 'alice-demo-session', method = 'GET', body } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(session ? { 'x-demo-session': session } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
}

test('normal: health and catalog are available', async t => {
  const call = await shop(t);
  assert.equal((await call('/health')).status, 200);
  const catalog = await call('/api/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.items.find(item => item.id === 'keyboard').unitPrice, 5000);
});

test('normal: unauthenticated purchase and order read are rejected', async t => {
  const call = await shop(t);
  assert.equal((await call('/api/orders/order-1001', { session: null })).status, 401);
  assert.equal((await call('/api/checkout', { session: null, method: 'POST', body: { itemId: 'keyboard', quantity: 1, unitPrice: 5000 } })).status, 401);
});

test('normal: catalog-price purchase and own-order read work', async t => {
  const call = await shop(t);
  assert.equal((await call('/api/me')).body.balance, 12000);
  const purchase = await call('/api/checkout', { method: 'POST', body: { itemId: 'keyboard', quantity: 1, unitPrice: 5000 } });
  assert.equal(purchase.status, 201);
  assert.equal(purchase.body.order.total, 5000);
  assert.equal((await call('/api/me')).body.balance, 7000);
  assert.equal((await call('/api/orders/order-1001')).status, 200);
});

test('normal: invalid quantity does not change balance', async t => {
  const call = await shop(t);
  assert.equal((await call('/api/checkout', { method: 'POST', body: { itemId: 'keyboard', quantity: -1, unitPrice: 5000 } })).status, 400);
  assert.equal((await call('/api/me')).body.balance, 12000);
});
