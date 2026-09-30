import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let lat = 13.5362; // default Ratchaburi
  let lon = 99.8171;
  try {
    const body = await req.json();
    lat = body.lat ?? lat;
    lon = body.lon ?? lon;
  } catch {}

  try {
    const apiKey = Deno.env.get("METEOBLUE_APIKEY");
    if (!apiKey || apiKey === "dummy") throw new Error("NO_KEY");

    const url = `https://my.meteoblue.com/packages/basic-1h_basic-day?lat=${lat}&lon=${lon}&apikey=${apiKey}&format=json`;
    const res = await fetch(url);

    if (res.status === 429) throw new Error("METEOBLUE_429");

    const data = await res.text();
    return new Response(data, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    // This keeps your app working even when Meteoblue is over quota
    const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&models=best_match,ecmwf_ifs04,gfs_seamless`;
    const fb = await fetch(fallbackUrl);
    const fbData = await fb.text();
    return new Response(fbData, { headers: { ...cors, "Content-Type": "application/json" } });
  }
});