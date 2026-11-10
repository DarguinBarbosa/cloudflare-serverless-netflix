-- Catálogo de Netflix (Kaggle, Shivam Bansal) cargado en Cloudflare D1
-- Ejecución: npx wrangler d1 execute unidad4 --remote --file=db/schema.sql --yes
DROP TABLE IF EXISTS titles;

CREATE TABLE titles (
  show_id      TEXT PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('Movie', 'TV Show')),
  title        TEXT NOT NULL,
  director     TEXT,
  "cast"       TEXT,
  country      TEXT,
  date_added   DATE,             -- formato AAAA-MM-DD
  release_year INTEGER NOT NULL,
  rating       TEXT,
  duration     TEXT,
  listed_in    TEXT,
  description  TEXT
);
