// نفس محتوى db/schema.sql. تُنشأ الجداول تلقائياً عند أول طلب إن لم تكن موجودة (آمن للتكرار).
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS likes (product TEXT NOT NULL, device TEXT NOT NULL, ip TEXT, ts INTEGER NOT NULL, PRIMARY KEY (product, device))',
  'CREATE INDEX IF NOT EXISTS likes_ip ON likes (ip, ts)',
  "CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, product TEXT NOT NULL, rating INTEGER NOT NULL, author TEXT, comment TEXT, buyer TEXT NOT NULL DEFAULT 'new', status TEXT NOT NULL DEFAULT 'pending', device TEXT NOT NULL, ip TEXT, ts INTEGER NOT NULL)",
  'CREATE UNIQUE INDEX IF NOT EXISTS reviews_device ON reviews (product, device)',
  'CREATE INDEX IF NOT EXISTS reviews_status ON reviews (status, product)',
  'CREATE INDEX IF NOT EXISTS reviews_ip ON reviews (ip, ts)',
  'CREATE TABLE IF NOT EXISTS search_misses (term TEXT PRIMARY KEY, n INTEGER NOT NULL, first_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS miss_ip (ip TEXT NOT NULL, ts INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS miss_ip_idx ON miss_ip (ip, ts)',
  'CREATE TABLE IF NOT EXISTS review_tokens (nonce TEXT PRIMARY KEY, product TEXT NOT NULL, ts INTEGER NOT NULL)',
  "CREATE TABLE IF NOT EXISTS orders (ref TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, city TEXT NOT NULL, address TEXT, note TEXT, status TEXT NOT NULL, availability TEXT NOT NULL, handler_kind TEXT NOT NULL, handler_name TEXT NOT NULL, handler_phone TEXT NOT NULL, department TEXT, reason TEXT NOT NULL, subtotal INTEGER NOT NULL DEFAULT 0, lang TEXT, ip TEXT, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_ts)",
  "CREATE INDEX IF NOT EXISTS orders_ip ON orders (ip, created_ts)",
  "CREATE TABLE IF NOT EXISTS order_items (ref TEXT NOT NULL, product TEXT NOT NULL, name TEXT NOT NULL, qty INTEGER NOT NULL, price INTEGER, state TEXT NOT NULL, department TEXT, PRIMARY KEY (ref, product))",
  "CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT, ts INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS order_events_ref ON order_events (ref, ts)",
];
