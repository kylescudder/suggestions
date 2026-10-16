CREATE TABLE IF NOT EXISTS suggestions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  author_name TEXT,
  author_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suggestions_status_idx ON suggestions (status);

-- Preserve source IDs when moving existing submissions from Convex.
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS legacy_convex_id TEXT;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS legacy_convex_created_at DOUBLE PRECISION;
CREATE UNIQUE INDEX IF NOT EXISTS suggestions_legacy_convex_id_idx ON suggestions (legacy_convex_id);
