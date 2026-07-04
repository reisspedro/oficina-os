const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar-em-producao';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET é obrigatório em produção — defina a variável de ambiente.');
  process.exit(1);
}

app.use(express.json());

const authAttempts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const rec = authAttempts.get(req.ip) || { count: 0, start: now };
  if (now - rec.start > 15 * 60 * 1000) { rec.count = 0; rec.start = now; }
  rec.count++;
  authAttempts.set(req.ip, rec);
  if (rec.count > 20) return res.status(429).json({ error: 'Muitas tentativas — aguarde 15 minutos' });
  next();
}

function money(v, fallback = 0) {
  const n = v === undefined || v === null || v === '' ? fallback : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validItems(userId, items) {
  const out = [];
  for (const it of items) {
    if (!it.description) continue;
    const qty = Number(it.qty ?? 1);
    const price = money(it.unit_price);
    if (!Number.isFinite(qty) || qty <= 0 || price === null) return { error: 'Itens com quantidade ou preço inválidos' };
    let partId = null;
    if (it.part_id) {
      const part = db.prepare('SELECT id FROM parts WHERE id=? AND user_id=?').get(it.part_id, userId);
      if (!part) return { error: 'Peça inválida' };
      partId = part.id;
    }
    out.push({ part_id: partId, type: it.type === 'peca' ? 'peca' : 'servico', description: it.description, qty, unit_price: price });
  }
  return { items: out };
}

function ownedClientId(userId, clientId) {
  if (!clientId) return { id: null };
  const c = db.prepare('SELECT id FROM clients WHERE id=? AND user_id=?').get(clientId, userId);
  return c ? { id: c.id } : { error: 'Cliente inválido' };
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada' });
  }
}

app.post('/api/register', rateLimit, (req, res) => {
  const { name, email, password, shop_name, shop_phone } = req.body || {};
  if (!name || !email || !password || !shop_name) {
    return res.status(400).json({ error: 'Preencha nome, e-mail, senha e nome da oficina' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Senha precisa de 6+ caracteres' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, shop_name, shop_phone) VALUES (?,?,?,?,?)'
  ).run(name, email.toLowerCase(), hash, shop_name, shop_phone || '');
  const token = jwt.sign({ id: info.lastInsertRowid, shop_name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: info.lastInsertRowid, name, shop_name } });
});

app.post('/api/login', rateLimit, (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  const token = jwt.sign({ id: user.id, shop_name: user.shop_name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, shop_name: user.shop_name } });
});

app.get('/api/clients', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY name').all(req.user.id));
});

app.post('/api/clients', auth, (req, res) => {
  const { name, phone, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const info = db.prepare('INSERT INTO clients (user_id, name, phone, notes) VALUES (?,?,?,?)')
    .run(req.user.id, name, phone || '', notes || '');
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/clients/:id', auth, (req, res) => {
  const { name, phone, notes } = req.body || {};
  const r = db.prepare('UPDATE clients SET name=?, phone=?, notes=? WHERE id=? AND user_id=?')
    .run(name, phone || '', notes || '', req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
});

app.delete('/api/clients/:id', auth, (req, res) => {
  const used = db.prepare('SELECT id FROM service_orders WHERE client_id=? AND user_id=? LIMIT 1')
    .get(req.params.id, req.user.id);
  if (used) return res.status(409).json({ error: 'Cliente tem OS vinculada — não pode excluir' });
  db.prepare('DELETE FROM clients WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/parts', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM parts WHERE user_id = ? ORDER BY name').all(req.user.id));
});

app.post('/api/parts', auth, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const vals = [money(req.body.qty), money(req.body.min_qty), money(req.body.cost_price), money(req.body.sale_price)];
  if (vals.some((v) => v === null)) return res.status(400).json({ error: 'Valores não podem ser negativos' });
  const info = db.prepare(
    'INSERT INTO parts (user_id, name, qty, min_qty, cost_price, sale_price) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, name, ...vals);
  res.json(db.prepare('SELECT * FROM parts WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/parts/:id', auth, (req, res) => {
  const { name } = req.body || {};
  const vals = [money(req.body.qty), money(req.body.min_qty), money(req.body.cost_price), money(req.body.sale_price)];
  if (vals.some((v) => v === null)) return res.status(400).json({ error: 'Valores não podem ser negativos' });
  const r = db.prepare(
    'UPDATE parts SET name=?, qty=?, min_qty=?, cost_price=?, sale_price=? WHERE id=? AND user_id=?'
  ).run(name, ...vals, req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Peça não encontrada' });
  res.json(db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id));
});

app.delete('/api/parts/:id', auth, (req, res) => {
  const used = db.prepare(
    `SELECT oi.id FROM os_items oi JOIN service_orders so ON so.id = oi.os_id
     WHERE oi.part_id=? AND so.user_id=? LIMIT 1`
  ).get(req.params.id, req.user.id);
  if (used) return res.status(409).json({ error: 'Peça usada em OS — não pode excluir' });
  db.prepare('DELETE FROM parts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

function osWithItems(os) {
  const items = db.prepare('SELECT * FROM os_items WHERE os_id = ?').all(os.id);
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const client = os.client_id
    ? db.prepare('SELECT id, name, phone FROM clients WHERE id = ? AND user_id = ?').get(os.client_id, os.user_id)
    : null;
  return { ...os, items, client, subtotal, total: Math.max(0, subtotal - os.discount) };
}

app.get('/api/os', auth, (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT so.* FROM service_orders so LEFT JOIN clients c ON c.id = so.client_id WHERE so.user_id=?';
  const params = [req.user.id];
  if (status) { sql += ' AND so.status=?'; params.push(status); }
  if (q) {
    sql += ' AND (so.plate LIKE ? OR so.vehicle LIKE ? OR so.description LIKE ? OR c.name LIKE ? OR so.id = ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, Number(q) || 0);
  }
  sql += ' ORDER BY so.id DESC';
  res.json(db.prepare(sql).all(...params).map(osWithItems));
});

app.get('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  res.json(osWithItems(os));
});

const insertItem = db.prepare(
  'INSERT INTO os_items (os_id, part_id, type, description, qty, unit_price) VALUES (?,?,?,?,?,?)'
);

const createOsTx = db.transaction((userId, os, items) => {
  const info = db.prepare(
    `INSERT INTO service_orders (user_id, client_id, vehicle, plate, description, discount, share_token)
     VALUES (?,?,?,?,?,?,?)`
  ).run(userId, os.client_id, os.vehicle, os.plate, os.description, os.discount, os.share_token);
  for (const it of items) insertItem.run(info.lastInsertRowid, it.part_id, it.type, it.description, it.qty, it.unit_price);
  return info.lastInsertRowid;
});

app.post('/api/os', auth, (req, res) => {
  const { client_id, vehicle, plate, description, discount, items } = req.body || {};
  const cli = ownedClientId(req.user.id, client_id);
  if (cli.error) return res.status(400).json({ error: cli.error });
  const disc = money(discount);
  if (disc === null) return res.status(400).json({ error: 'Desconto não pode ser negativo' });
  const val = validItems(req.user.id, items || []);
  if (val.error) return res.status(400).json({ error: val.error });
  const osId = createOsTx(req.user.id, {
    client_id: cli.id, vehicle: vehicle || '', plate: plate || '', description: description || '',
    discount: disc, share_token: crypto.randomBytes(12).toString('hex'),
  }, val.items);
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(osId)));
});

app.put('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { client_id, vehicle, plate, description, discount, items } = req.body || {};
  if (Array.isArray(items) && os.status !== 'orcamento') {
    return res.status(409).json({ error: 'Itens só podem ser alterados com a OS em orçamento — volte o status primeiro' });
  }
  const cli = client_id !== undefined ? ownedClientId(req.user.id, client_id) : { id: os.client_id };
  if (cli.error) return res.status(400).json({ error: cli.error });
  const disc = discount !== undefined ? money(discount) : os.discount;
  if (disc === null) return res.status(400).json({ error: 'Desconto não pode ser negativo' });
  let val = null;
  if (Array.isArray(items)) {
    val = validItems(req.user.id, items);
    if (val.error) return res.status(400).json({ error: val.error });
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE service_orders SET client_id=?, vehicle=?, plate=?, description=?, discount=?,
       updated_at=datetime('now') WHERE id=?`
    ).run(cli.id, vehicle ?? os.vehicle, plate ?? os.plate, description ?? os.description, disc, os.id);
    if (val) {
      db.prepare('DELETE FROM os_items WHERE os_id=?').run(os.id);
      for (const it of val.items) insertItem.run(os.id, it.part_id, it.type, it.description, it.qty, it.unit_price);
    }
  })();
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(os.id)));
});

const FLOW = ['orcamento', 'aprovada', 'em_execucao', 'pronta', 'entregue'];

app.post('/api/os/:id/status', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { status } = req.body || {};
  if (!FLOW.includes(status) && status !== 'cancelada') {
    return res.status(400).json({ error: 'Status inválido' });
  }

  setStatusTx(os, status);
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(os.id)));
});

function moveStock(os, sign) {
  const items = db.prepare('SELECT * FROM os_items WHERE os_id=? AND part_id IS NOT NULL').all(os.id);
  const upd = db.prepare(`UPDATE parts SET qty = qty ${sign} ? WHERE id=? AND user_id=?`);
  for (const it of items) upd.run(it.qty, it.part_id, os.user_id);
}

const setStatusTx = db.transaction((os, status) => {
  const deductNow = ['aprovada', 'em_execucao', 'pronta', 'entregue'].includes(status);
  if (deductNow && !os.stock_deducted) {
    moveStock(os, '-');
    db.prepare('UPDATE service_orders SET stock_deducted=1 WHERE id=?').run(os.id);
  }
  if (!deductNow && os.stock_deducted) {
    moveStock(os, '+');
    db.prepare('UPDATE service_orders SET stock_deducted=0 WHERE id=?').run(os.id);
  }
  db.prepare(
    `UPDATE service_orders SET status=?, updated_at=datetime('now'),
     delivered_at = CASE WHEN ?='entregue' THEN datetime('now') ELSE delivered_at END WHERE id=?`
  ).run(status, status, os.id);
});

app.post('/api/os/:id/pay', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const paid = !!(req.body || {}).paid;
  db.prepare(`UPDATE service_orders SET paid_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
    updated_at=datetime('now') WHERE id=?`).run(paid ? 1 : 0, os.id);
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(os.id)));
});

app.delete('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  db.transaction(() => {
    if (os.stock_deducted) moveStock(os, '+');
    db.prepare('DELETE FROM service_orders WHERE id=?').run(os.id);
  })();
  res.json({ ok: true });
});

app.get('/api/public/os/:token', (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE share_token=?').get(req.params.token);
  if (!os) return res.status(404).json({ error: 'Orçamento não encontrado' });
  const shop = db.prepare('SELECT shop_name, shop_phone FROM users WHERE id=?').get(os.user_id);
  const full = osWithItems(os);
  res.json({
    id: full.id, status: full.status, vehicle: full.vehicle, plate: full.plate,
    description: full.description, created_at: full.created_at, discount: full.discount,
    subtotal: full.subtotal, total: full.total,
    client: full.client ? { name: full.client.name } : null,
    items: full.items.map(({ id, type, description, qty, unit_price }) => ({ id, type, description, qty, unit_price })),
    shop,
  });
});

app.get('/api/dashboard', auth, (req, res) => {
  const counts = {};
  for (const s of [...FLOW, 'cancelada']) {
    counts[s] = db.prepare('SELECT COUNT(*) c FROM service_orders WHERE user_id=? AND status=?')
      .get(req.user.id, s).c;
  }
  const delivered = db.prepare(
    `SELECT * FROM service_orders WHERE user_id=? AND status='entregue'
     AND delivered_at >= datetime('now','start of month')`
  ).all(req.user.id);
  const revenue = delivered.reduce((s, os) => s + osWithItems(os).total, 0);
  const lowStock = db.prepare(
    'SELECT * FROM parts WHERE user_id=? AND qty <= min_qty AND min_qty > 0 ORDER BY name'
  ).all(req.user.id);
  const unpaid = db.prepare(
    `SELECT * FROM service_orders WHERE user_id=? AND status='entregue' AND paid_at IS NULL`
  ).all(req.user.id);
  const toReceive = unpaid.reduce((s, os) => s + osWithItems(os).total, 0);
  res.json({
    counts, revenue_month: revenue, delivered_month: delivered.length, low_stock: lowStock,
    to_receive: toReceive, unpaid_count: unpaid.length,
  });
});

const dist = path.join(__dirname, 'client', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`OficinaOS rodando na porta ${PORT}`));
