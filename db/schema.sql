-- قاعدة D1 للإعجابات وتقييمات الزوار. شغّلها مرة واحدة في Cloudflare ← D1 ← Console (آمنة للتكرار).
CREATE TABLE IF NOT EXISTS likes (
  product TEXT NOT NULL,
  device  TEXT NOT NULL,
  ip      TEXT,
  ts      INTEGER NOT NULL,
  PRIMARY KEY (product, device)
);
CREATE INDEX IF NOT EXISTS likes_ip ON likes (ip, ts);

CREATE TABLE IF NOT EXISTS reviews (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  rating  INTEGER NOT NULL,
  author  TEXT,
  comment TEXT,
  buyer   TEXT NOT NULL DEFAULT 'new',
  status  TEXT NOT NULL DEFAULT 'pending',
  device  TEXT NOT NULL,
  ip      TEXT,
  ts      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_device ON reviews (product, device);
CREATE INDEX IF NOT EXISTS reviews_status ON reviews (status, product);
CREATE INDEX IF NOT EXISTS reviews_ip ON reviews (ip, ts);

-- روابط التقييم الموثّق (تُستعمل مرة واحدة)
CREATE TABLE IF NOT EXISTS review_tokens (
  nonce   TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
