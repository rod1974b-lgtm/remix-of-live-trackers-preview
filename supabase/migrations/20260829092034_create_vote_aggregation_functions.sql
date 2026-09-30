/*
# Create vote aggregation RPC functions

## Purpose
Two functions to aggregate community votes on weather models:
1. `get_local_vote_aggregates(lat, lon, radius)` — returns average rating and vote count per model for locations within a radius (in degrees) of the given coordinates.
2. `get_global_vote_aggregates()` — returns average rating and vote count per model across all votes worldwide.

## Functions
- `get_local_vote_aggregates(lat double precision, lon double precision, radius double precision)`
  Returns: TABLE(model_id text, model_name text, avg_rating numeric, vote_count bigint)
  Filters votes within `radius` degrees of (lat, lon) using a bounding box approximation.
- `get_global_vote_aggregates()`
  Returns: TABLE(model_id text, model_name text, avg_rating numeric, vote_count bigint)
  Aggregates all votes regardless of location.

## Security
- Both functions are SECURITY DEFINER so the anon role can call them.
- Both functions are STABLE (read-only) and return aggregated data only — no individual vote rows.
- `search_path` is set to `public` to prevent search_path injection.
*/

CREATE OR REPLACE FUNCTION get_local_vote_aggregates(
  lat double precision,
  lon double precision,
  radius double precision DEFAULT 0.5
)
RETURNS TABLE(
  model_id text,
  model_name text,
  avg_rating numeric,
  vote_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    model_id,
    model_name,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    COUNT(*)::bigint AS vote_count
  FROM model_votes
  WHERE latitude BETWEEN (lat - radius) AND (lat + radius)
    AND longitude BETWEEN (lon - radius) AND (lon + radius)
  GROUP BY model_id, model_name
  ORDER BY avg_rating DESC, vote_count DESC;
$$;

CREATE OR REPLACE FUNCTION get_global_vote_aggregates()
RETURNS TABLE(
  model_id text,
  model_name text,
  avg_rating numeric,
  vote_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    model_id,
    model_name,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    COUNT(*)::bigint AS vote_count
  FROM model_votes
  GROUP BY model_id, model_name
  ORDER BY avg_rating DESC, vote_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_local_vote_aggregates(double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_global_vote_aggregates() TO anon, authenticated;
