// OficinaOS — API + frontend estático
// "Toda obra do diligente certamente prospera." — Provérbios 13:4
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-trocar-em-producao';

app.use(express.json());

// ---------- auth ----------
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

app.post('/api/register', (req, res) => {
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

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  const token = jwt.sign({ id: user.id, shop_name: user.shop_name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, shop_name: user.shop_name } });
});

// ---------- clientes ----------
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

// ---------- estoque ----------
app.get('/api/parts', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM parts WHERE user_id = ? ORDER BY name').all(req.user.id));
});

app.post('/api/parts', auth, (req, res) => {
  const { name, qty, min_qty, cost_price, sale_price } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const info = db.prepare(
    'INSERT INTO parts (user_id, name, qty, min_qty, cost_price, sale_price) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, name, qty || 0, min_qty || 0, cost_price || 0, sale_price || 0);
  res.json(db.prepare('SELECT * FROM parts WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/parts/:id', auth, (req, res) => {
  const { name, qty, min_qty, cost_price, sale_price } = req.body || {};
  const r = db.prepare(
    'UPDATE parts SET name=?, qty=?, min_qty=?, cost_price=?, sale_price=? WHERE id=? AND user_id=?'
  ).run(name, qty || 0, min_qty || 0, cost_price || 0, sale_price || 0, req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Peça não encontrada' });
  res.json(db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id));
});

app.delete('/api/parts/:id', auth, (req, res) => {
  db.prepare('DELETE FROM parts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- ordens de serviço ----------
function osWithItems(os) {
  const items = db.prepare('SELECT * FROM os_items WHERE os_id = ?').all(os.id);
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const client = os.client_id
    ? db.prepare('SELECT id, name, phone FROM clients WHERE id = ?').get(os.client_id)
    : null;
  return { ...os, items, client, subtotal, total: Math.max(0, subtotal - os.discount) };
}

app.get('/api/os', auth, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM service_orders WHERE user_id=? AND status=? ORDER BY id DESC')
      .all(req.user.id, status);
  } else {
    rows = db.prepare('SELECT * FROM service_orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  }
  res.json(rows.map(osWithItems));
});

app.get('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  res.json(osWithItems(os));
});

app.post('/api/os', auth, (req, res) => {
  const { client_id, vehicle, plate, description, discount, items } = req.body || {};
  const token = crypto.randomBytes(12).toString('hex');
  const info = db.prepare(
    `INSERT INTO service_orders (user_id, client_id, vehicle, plate, description, discount, share_token)
     VALUES (?,?,?,?,?,?,?)`
  ).run(req.user.id, client_id || null, vehicle || '', plate || '', description || '', discount || 0, token);
  const osId = info.lastInsertRowid;
  const insertItem = db.prepare(
    'INSERT INTO os_items (os_id, part_id, type, description, qty, unit_price) VALUES (?,?,?,?,?,?)'
  );
  for (const it of items || []) {
    if (!it.description) continue;
    insertItem.run(osId, it.part_id || null, it.type === 'peca' ? 'peca' : 'servico',
      it.description, it.qty || 1, it.unit_price || 0);
  }
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(osId)));
});

app.put('/api/os/:id', auth, (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!os) return res.status(404).json({ error: 'OS não encontrada' });
  const { client_id, vehicle, plate, description, discount, items } = req.body || {};
  db.prepare(
    `UPDATE service_orders SET client_id=?, vehicle=?, plate=?, description=?, discount=?,
     updated_at=datetime('now') WHERE id=?`
  ).run(client_id ?? os.client_id, vehicle ?? os.vehicle, plate ?? os.plate,
    description ?? os.description, discount ?? os.discount, os.id);
  if (Array.isArray(items)) {
    db.prepare('DELETE FROM os_items WHERE os_id=?').run(os.id);
    const insertItem = db.prepare(
      'INSERT INTO os_items (os_id, part_id, type, description, qty, unit_price) VALUES (?,?,?,?,?,?)'
    );
    for (const it of items) {
      if (!it.description) continue;
      insertItem.run(os.id, it.part_id || null, it.type === 'peca' ? 'peca' : 'servico',
        it.description, it.qty || 1, it.unit_price || 0);
    }
  }
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
  // baixa de estoque quando orçamento vira aprovada (uma vez só)
  if (status === 'aprovada' && os.status === 'orcamento') {
    const items = db.prepare('SELECT * FROM os_items WHERE os_id=? AND part_id IS NOT NULL').all(os.id);
    const dec = db.prepare('UPDATE parts SET qty = qty - ? WHERE id=? AND user_id=?');
    for (const it of items) dec.run(it.qty, it.part_id, req.user.id);
  }
  db.prepare(
    `UPDATE service_orders SET status=?, updated_at=datetime('now'),
     delivered_at = CASE WHEN ?='entregue' THEN datetime('now') ELSE delivered_at END WHERE id=?`
  ).run(status, status, os.id);
  res.json(osWithItems(db.prepare('SELECT * FROM service_orders WHERE id=?').get(os.id)));
});

app.delete('/api/os/:id', auth, (req, res) => {
  db.prepare('DELETE FROM service_orders WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- orçamento público (link WhatsApp) ----------
app.get('/api/public/os/:token', (req, res) => {
  const os = db.prepare('SELECT * FROM service_orders WHERE share_token=?').get(req.params.token);
  if (!os) return res.status(404).json({ error: 'Orçamento não encontrado' });
  const shop = db.prepare('SELECT shop_name, shop_phone FROM users WHERE id=?').get(os.user_id);
  res.json({ ...osWithItems(os), shop });
});

// ---------- dashboard ----------
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
  res.json({ counts, revenue_month: revenue, delivered_month: delivered.length, low_stock: lowStock });
});

// ---------- frontend ----------
const dist = path.join(__dirname, 'client', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`OficinaOS rodando na porta ${PORT}`));
