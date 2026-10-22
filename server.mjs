import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Deliberately vulnerable, synthetic training shop. Never expose publicly.
const catalog = [{ id: 'keyboard', name: 'Demo keyboard', unitPrice: 5000 }, { id: 'mouse', name: 'Demo mouse', unitPrice: 2000 }];
const sessions = new Map([['alice-demo-session', 'alice'], ['bob-demo-session', 'bob']]);

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('body too large');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
  return body;
}

export function createShop() {
  const balances = new Map([['alice', 12000], ['bob', 8000]]);
  const orders = new Map([
    ['order-1001', { id: 'order-1001', userId: 'alice', itemId: 'mouse', quantity: 1, total: 2000, shippingAddress: 'DEMO ADDRESS ALPHA' }],
    ['order-1002', { id: 'order-1002', userId: 'bob', itemId: 'keyboard', quantity: 1, total: 5000, shippingAddress: 'DEMO ADDRESS BETA' }],
  ]);
  let nextOrder = 1003;
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://demo.internal');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true, service: 'intentional-demo-shop' });
      if (request.method === 'GET' && url.pathname === '/api/catalog') return send(response, 200, { items: catalog });
      const userId = sessions.get(request.headers['x-demo-session']);
      if (!userId) return send(response, 401, { error: 'demo session required' });
      if (request.method === 'GET' && url.pathname === '/api/me') return send(response, 200, { userId, balance: balances.get(userId) });
      if (request.method === 'POST' && url.pathname === '/api/checkout') {
        const body = await readBody(request);
        const item = catalog.find(item => item.id === body.itemId);
        if (!item || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 10) return send(response, 400, { error: 'invalid purchase' });
        // Intentional flaw #1: the client, not the catalog, controls billing price.
        const unitPrice = body.unitPrice;
        if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice)) return send(response, 400, { error: 'invalid price' });
        const total = unitPrice * body.quantity;
        const balance = balances.get(userId);
        if (balance < total) return send(response, 409, { error: 'insufficient balance' });
        balances.set(userId, balance - total);
        const id = `order-${nextOrder++}`;
        const order = { id, userId, itemId: item.id, quantity: body.quantity, total, shippingAddress: userId === 'alice' ? 'DEMO ADDRESS ALPHA' : 'DEMO ADDRESS BETA' };
        orders.set(id, order);
        return send(response, 201, { order, balance: balances.get(userId) });
      }
      if (request.method === 'GET' && /^\/api\/orders\/order-\d+$/.test(url.pathname)) {
        const order = orders.get(url.pathname.split('/').at(-1));
        if (!order) return send(response, 404, { error: 'order not found' });
        // Intentional flaw #2: authenticating a caller does not check ownership.
        return send(response, 200, { order });
      }
      return send(response, 404, { error: 'not found' });
    } catch { return send(response, 400, { error: 'invalid request' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createShop();
  server.listen(Number(process.env.PORT ?? 18080), '127.0.0.1', () => process.stdout.write('Demo shop listening inside the worker on 18080\n'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
