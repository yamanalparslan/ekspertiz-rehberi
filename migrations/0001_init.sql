CREATE TABLE vehicle_kb (
  id TEXT PRIMARY KEY,
  brand TEXT,
  json TEXT
);

CREATE TABLE generic_prices (
  id TEXT PRIMARY KEY,
  json TEXT
);

CREATE TABLE price_cache (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT,
  json TEXT,
  as_of TEXT
);

CREATE TABLE daily_spend (
  day TEXT PRIMARY KEY,
  usd REAL NOT NULL DEFAULT 0
);
