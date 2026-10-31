-- Esquema do Jogaê! (idempotente: pode rodar a cada inicialização)

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar        JSONB NOT NULL DEFAULT '{"character":"tuca","color":"#FFB627"}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS images (
  id         UUID PRIMARY KEY,
  owner_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  mime       TEXT NOT NULL,
  data       BYTEA NOT NULL,
  size       INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
  id             UUID PRIMARY KEY,
  owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  subject        TEXT NOT NULL DEFAULT 'Geral',
  cover_image    UUID,
  questions      JSONB NOT NULL DEFAULT '[]',
  settings       JSONB NOT NULL DEFAULT '{}',
  share_code     TEXT NOT NULL UNIQUE,
  is_shared      BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo        BOOLEAN NOT NULL DEFAULT FALSE,
  plays          INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_owner_idx ON games (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY,
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  game_id     UUID REFERENCES games(id) ON DELETE SET NULL,
  game_title  TEXT NOT NULL,
  mode        TEXT NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS matches_owner_idx ON matches (owner_id, started_at DESC);
