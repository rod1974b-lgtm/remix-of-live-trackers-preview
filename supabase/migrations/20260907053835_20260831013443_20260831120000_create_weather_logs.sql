/*
# Create weather logs table for shared observations

1. New Tables
- `weather_logs`
  - `id` (uuid, primary key) — unique identifier for each observation.
  - `location_name` (text) — city or place where the observation was recorded.
  - `latitude` and `longitude` (double precision) — coordinates used to group logs by location.
  - `country` (text) — country label for the observation location.
  - `observed_at` (timestamptz) — date and time the user recorded the observation.
  - `weather_type` (text) — selected observer category such as Clear, Rain, or Thunderstorm.
  - `temperature` (numeric) — observed temperature in Celsius.
  - `precipitation` (numeric) — observed precipitation amount in millimetres.
  - `wind_speed` (numeric) — observed wind speed in kilometres per hour.
  - `notes` (text) — optional user description of what they observed.
  - `created_at` (timestamptz) — time the log was saved.

2. Indexes
- Index location and observation time for the logs view and location history queries.
- Index weather type for filter counts.

3. Security
- Row level security is enabled on `weather_logs`.
- This project has no sign-in screen, so observations are intentionally shared and available to the `anon` and `authenticated` roles.
- Separate policies allow public select, insert, update, and delete operations.

4. Important Notes
- No existing tables or user data are modified.
- The numeric ranges and weather type allow-list are validated at the database boundary.
*/

CREATE TABLE IF NOT EXISTS weather_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  country text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  weather_type text NOT NULL CHECK (weather_type IN ('Dry', 'Drizzle', 'Light Rain', 'Showers', 'Heavy Rain', 'Thunderstorm', 'Overcast', 'Clear', 'Mist', 'Fog', 'Hail', 'Windy')),
  temperature numeric(5, 1) NOT NULL CHECK (temperature >= -100 AND temperature <= 100),
  precipitation numeric(7, 2) NOT NULL DEFAULT 0 CHECK (precipitation >= 0 AND precipitation <= 1000),
  wind_speed numeric(7, 1) NOT NULL DEFAULT 0 CHECK (wind_speed >= 0 AND wind_speed <= 500),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_logs_location_time ON weather_logs (latitude, longitude, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_logs_type ON weather_logs (weather_type);

ALTER TABLE weather_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_weather_logs" ON weather_logs;
CREATE POLICY "anon_select_weather_logs" ON weather_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_weather_logs" ON weather_logs;
CREATE POLICY "anon_insert_weather_logs" ON weather_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_weather_logs" ON weather_logs;
CREATE POLICY "anon_update_weather_logs" ON weather_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_weather_logs" ON weather_logs;
CREATE POLICY "anon_delete_weather_logs" ON weather_logs FOR DELETE
  TO anon, authenticated USING (true);