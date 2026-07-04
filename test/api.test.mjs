import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PORT = 4700 + (process.pid % 1000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `oficina-os-api-${process.pid}-${Date.now()}.sqlite`);
const JWT_SECRET = 'test-jwt-secret';

let server;
let serverOutput = '';

async function request(method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { status: response.status, body: json, headers: response.headers };
}

async function jsonOk(method, route, options) {
  const response = await request(method, route, options);
  assert.equal(response.status, 200, `${method} ${route} should return 200`);
  return response.body;
}

async function expectStatus(method, route, expectedStatus, options) {
  const response = await request(method, route, options);
  assert.equal(response.status, expectedStatus, `${method} ${route} should return ${expectedStatus}`);
  return response.body;
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with code ${server.exitCode}\n${serverOutput}`);
    }

    try {
      await fetch(`${BASE_URL}/api/public/os/x`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`server did not start: ${lastError?.message || 'timeout'}\n${serverOutput}`);
}

function auth(token) {
  return { token };
}

describe('OficinaOS API contract', { concurrency: false }, () => {
  const state = {
    userA: {},
    userB: {},
    clientA: null,
    clientB: null,
    partA: null,
    partB: null,
    osA: null,
    editOs: null,
    deleteOs: null
  };

  before(async () => {
    server = spawn('node', ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH,
        PORT: String(PORT),
        JWT_SECRET
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk;
    });
    server.stderr.on('data', (chunk) => {
      serverOutput += chunk;
    });

    await waitForServer();
  });

  after(async () => {
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once('exit', resolve));
    }

    await rm(DB_PATH, { force: true });
    await rm(`${DB_PATH}-shm`, { force: true });
    await rm(`${DB_PATH}-wal`, { force: true });
  });

  it('registers users and returns bearer tokens', async () => {
    const suffix = `${process.pid}.${Date.now()}`;
    const emailA = `alice.${suffix}@example.test`;
    const emailB = `bruno.${suffix}@example.test`;

    const userA = await jsonOk('POST', '/api/register', {
      body: {
        name: 'Alice',
        email: emailA,
        password: 'secret1',
        shop_name: 'Oficina Alice'
      }
    });

    assert.equal(typeof userA.token, 'string');
    assert.ok(userA.token.length > 10);
    assert.equal(userA.user.name, 'Alice');
    assert.equal(userA.user.shop_name, 'Oficina Alice');
    state.userA = { ...userA, email: emailA };

    const userB = await jsonOk('POST', '/api/register', {
      body: {
        name: 'Bruno',
        email: emailB,
        password: 'secret2',
        shop_name: 'Oficina Bruno'
      }
    });

    assert.equal(typeof userB.token, 'string');
    assert.ok(userB.token.length > 10);
    assert.equal(userB.user.name, 'Bruno');
    state.userB = { ...userB, email: emailB };
  });

  it('creates clients and parts for isolated users', async () => {
    state.clientA = await jsonOk('POST', '/api/clients', {
      ...auth(state.userA.token),
      body: { name: 'Cliente A', phone: '11999990000' }
    });

    assert.equal(state.clientA.name, 'Cliente A');
    assert.equal(state.clientA.phone, '11999990000');

    state.partA = await jsonOk('POST', '/api/parts', {
      ...auth(state.userA.token),
      body: { name: 'Radiador', qty: 5, min_qty: 1, cost_price: 10, sale_price: 20 }
    });

    assert.equal(state.partA.name, 'Radiador');
    assert.equal(state.partA.qty, 5);
    assert.equal(state.partA.min_qty, 1);
    assert.equal(state.partA.cost_price, 10);
    assert.equal(state.partA.sale_price, 20);

    state.clientB = await jsonOk('POST', '/api/clients', {
      ...auth(state.userB.token),
      body: { name: 'Cliente B', phone: '11888880000' }
    });

    state.partB = await jsonOk('POST', '/api/parts', {
      ...auth(state.userB.token),
      body: { name: 'Filtro B', qty: 5, min_qty: 1, cost_price: 8, sale_price: 18 }
    });
  });

  it('creates an OS with items, subtotal and total', async () => {
    state.osA = await jsonOk('POST', '/api/os', {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Scania',
        plate: 'ABC1D23',
        items: [
          {
            type: 'peca',
            part_id: state.partA.id,
            description: 'Radiador',
            qty: 2,
            unit_price: 100
          },
          {
            type: 'servico',
            description: 'Mao de obra',
            qty: 1,
            unit_price: 50
          }
        ]
      }
    });

    assert.equal(state.osA.vehicle, 'Scania');
    assert.equal(state.osA.plate, 'ABC1D23');
    assert.equal(state.osA.subtotal, 250);
    assert.equal(state.osA.total, 250);
    assert.equal(state.osA.items.length, 2);
  });

  it('validates invalid OS payloads and cross-user references', async () => {
    const validItem = {
      type: 'peca',
      part_id: state.partA.id,
      description: 'Radiador',
      qty: 1,
      unit_price: 100
    };

    await expectStatus('POST', '/api/os', 400, {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Scania',
        plate: 'BADQTY1',
        items: [{ ...validItem, qty: 0 }]
      }
    });

    await expectStatus('POST', '/api/os', 400, {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Scania',
        plate: 'BADVAL1',
        items: [{ ...validItem, unit_price: -1 }]
      }
    });

    await expectStatus('POST', '/api/os', 400, {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Scania',
        plate: 'BADDIS1',
        discount: -1,
        items: [validItem]
      }
    });

    await expectStatus('POST', '/api/os', 400, {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientB.id,
        vehicle: 'Scania',
        plate: 'BADCLI1',
        items: [validItem]
      }
    });

    await expectStatus('POST', '/api/os', 400, {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Scania',
        plate: 'BADPAR1',
        items: [{ ...validItem, part_id: state.partB.id }]
      }
    });
  });

  it('does not expose another user OS by id', async () => {
    await expectStatus('GET', `/api/os/${state.osA.id}`, 404, auth(state.userB.token));
  });

  it('finds OS records by query text', async () => {
    const found = await jsonOk('GET', '/api/os?q=ABC1D23', auth(state.userA.token));
    assert.ok(Array.isArray(found));
    assert.ok(found.some((osRecord) => osRecord.id === state.osA.id));

    const empty = await jsonOk('GET', '/api/os?q=inexistentexyz', auth(state.userA.token));
    assert.deepEqual(empty, []);
  });

  it('marks OS payment and clears paid_at when unpaid', async () => {
    const paid = await jsonOk('POST', `/api/os/${state.osA.id}/pay`, {
      ...auth(state.userA.token),
      body: { paid: true }
    });
    assert.ok(paid.paid_at);

    const unpaid = await jsonOk('POST', `/api/os/${state.osA.id}/pay`, {
      ...auth(state.userA.token),
      body: { paid: false }
    });
    assert.equal(unpaid.paid_at, null);
  });

  it('returns a sanitized public OS payload by share token', async () => {
    const authenticated = await jsonOk('GET', `/api/os/${state.osA.id}`, auth(state.userA.token));
    assert.equal(typeof authenticated.share_token, 'string');
    assert.ok(authenticated.share_token.length > 0);

    const publicOs = await jsonOk('GET', `/api/public/os/${authenticated.share_token}`);
    assert.equal(publicOs.id, state.osA.id);
    assert.equal(publicOs.status, authenticated.status);
    assert.equal(publicOs.vehicle, 'Scania');
    assert.equal(publicOs.plate, 'ABC1D23');
    assert.equal(publicOs.subtotal, 250);
    assert.equal(publicOs.total, 250);
    assert.ok(Array.isArray(publicOs.items));
    assert.equal(publicOs.shop.shop_name, 'Oficina Alice');
    assert.equal(Object.hasOwn(publicOs, 'user_id'), false);
    assert.equal(Object.hasOwn(publicOs, 'client_id'), false);
    assert.equal(Object.hasOwn(publicOs, 'share_token'), false);
  });

  it('moves stock exactly once across status transitions', async () => {
    const approved = await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'aprovada' }
    });
    assert.equal(approved.status, 'aprovada');

    let parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 3);

    await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'aprovada' }
    });

    parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 3);

    await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'orcamento' }
    });

    parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 5);

    await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'aprovada' }
    });

    parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 3);

    await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'cancelada' }
    });

    parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 5);
  });

  it('only allows item editing while OS is in budget status', async () => {
    state.editOs = await jsonOk('POST', '/api/os', {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Iveco',
        plate: 'EDIT123',
        items: [
          {
            type: 'servico',
            description: 'Diagnostico',
            qty: 1,
            unit_price: 80
          }
        ]
      }
    });

    await jsonOk('POST', `/api/os/${state.editOs.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'aprovada' }
    });

    await expectStatus('PUT', `/api/os/${state.editOs.id}`, 409, {
      ...auth(state.userA.token),
      body: {
        items: [
          {
            type: 'servico',
            description: 'Servico bloqueado',
            qty: 1,
            unit_price: 10
          }
        ]
      }
    });

    const updated = await jsonOk('PUT', `/api/os/${state.editOs.id}`, {
      ...auth(state.userA.token),
      body: { vehicle: 'Scania R450' }
    });
    assert.equal(updated.vehicle, 'Scania R450');
    assert.equal(updated.status, 'aprovada');
  });

  it('blocks deleting a part used by an OS', async () => {
    await expectStatus('DELETE', `/api/parts/${state.partA.id}`, 409, auth(state.userA.token));
  });

  it('returns reserved stock when deleting an approved OS', async () => {
    await jsonOk('POST', `/api/os/${state.osA.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'cancelada' }
    });

    state.deleteOs = await jsonOk('POST', '/api/os', {
      ...auth(state.userA.token),
      body: {
        client_id: state.clientA.id,
        vehicle: 'Volvo',
        plate: 'DEL1T23',
        items: [
          {
            type: 'peca',
            part_id: state.partA.id,
            description: 'Radiador',
            qty: 2,
            unit_price: 100
          }
        ]
      }
    });

    await jsonOk('POST', `/api/os/${state.deleteOs.id}/status`, {
      ...auth(state.userA.token),
      body: { status: 'aprovada' }
    });

    let parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 3);

    await jsonOk('DELETE', `/api/os/${state.deleteOs.id}`, auth(state.userA.token));

    parts = await jsonOk('GET', '/api/parts', auth(state.userA.token));
    assert.equal(parts.find((part) => part.id === state.partA.id).qty, 5);
  });

  it('rate limits repeated bad login attempts', async () => {
    const statuses = [];

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await request('POST', '/api/login', {
        body: {
          email: state.userA.email,
          password: `wrong-${attempt}`
        }
      });
      statuses.push(response.status);
    }

    assert.ok(statuses.slice(-10).includes(429), `expected a 429 near the end, got ${statuses.join(',')}`);
  });
});
