// OficinaOS — schema SQLite
// "Tudo posso naquele que me fortalece." — Filipenses 4:13
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'oficina.db');
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_phone TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id INTEGER REFERENCES clients(id),
  vehicle TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'orcamento'
    CHECK (status IN ('orcamento','aprovada','em_execucao','pronta','entregue','cancelada')),
  discount REAL NOT NULL DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS os_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES parts(id),
  type TEXT NOT NULL DEFAULT 'servico' CHECK (type IN ('peca','servico')),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_os_user ON service_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_os_status ON service_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_items_os ON os_items(os_id);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_parts_user ON parts(user_id);
`);

module.exports = db;
