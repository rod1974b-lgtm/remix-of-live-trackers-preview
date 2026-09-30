/*
# Create model_votes table for weather model community ratings

## Purpose
Stores community votes on which weather model performs best for a given area.
Users search a location, compare forecasts from all available weather models,
and vote for the model they find most accurate for their region.

## New Tables
- `model_votes`
  - `id` (uuid, primary key)
  - `model_id` (text, not null) — identifier of the weather model (e.g. "icon_seamless", "gfs_seamless")
  - `model_name` (text, not null) — human-readable model name (e.g. "DWD ICON")
  - `location_name` (text, not null) — name of the searched location
  - `latitude` (double precision, not null) — latitude of the location
  - `longitude` (double precision, not null) — longitude of the location
  - `country` (text) — country of the location
  - `rating` (integer, not null, check 1-5) — user rating of the model's accuracy
  - `created_at` (timestamptz, default now)

## Indexes
- `idx_model_votes_location` on (latitude, longitude) for regional lookups
- `idx_model_votes_model` on (model_id) for per-model aggregation

## Security
- RLS enabled on `model_votes`.
- This is a no-auth (single-tenant) app: all CRUD is public via `TO anon, authenticated`.
- `USING (true)` / `WITH CHECK (true)` is acceptable because votes are intentionally public/shared community data.
*/

CREATE TABLE IF NOT EXISTS model_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  model_name text NOT NULL,
  location_name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  country text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_votes_location ON model_votes (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_model_votes_model ON model_votes (model_id);

ALTER TABLE model_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_model_votes" ON model_votes;
CREATE POLICY "anon_select_model_votes" ON model_votes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_model_votes" ON model_votes;
CREATE POLICY "anon_insert_model_votes" ON model_votes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_model_votes" ON model_votes;
CREATE POLICY "anon_update_model_votes" ON model_votes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_model_votes" ON model_votes;
CREATE POLICY "anon_delete_model_votes" ON model_votes FOR DELETE
  TO anon, authenticated USING (true);
