const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const sat = url.searchParams.get("sat") || "himawari";

  // NOAA's CDN no longer hosts Himawari, so himawari/jma use JMA's own imagery
  // (se1 = Southeast Asia true-colour, fd_ = full disk), newest 10-min slot in UTC.
  const jmaCandidates = (area: "se1" | "fd_"): string[] => {
    const out: string[] = [];
    const base = Date.now() - 20 * 60 * 1000;
    for (let k = 0; k < 6; k++) {
      const d = new Date(base - k * 10 * 60 * 1000);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(Math.floor(d.getUTCMinutes() / 10) * 10).padStart(2, "0");
      out.push(`https://www.data.jma.go.jp/mscweb/data/himawari/img/${area}/${area}_trm_${hh}${mm}.jpg`);
    }
    return out;
  };
  const NOAA: Record<string, string> = {
    "goes-east": "GOES19",
    "goes-west": "GOES18",
  };
  let targets: string[] = [];
  if (sat === "meteosat" || sat === "iodc") {
    return new Response(
      JSON.stringify({
        error: "Meteosat image feed unavailable",
        mapUrl: "https://view.eumetsat.int/productviewer?v=default",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (sat === "himawari") targets = [...jmaCandidates("se1"), ...jmaCandidates("fd_")];
  else if (sat === "jma") targets = jmaCandidates("fd_");
  else if (NOAA[sat]) targets = [`https://cdn.star.nesdis.noaa.gov/${NOAA[sat]}/ABI/FD/GEOCOLOR/1808x1808.jpg`];
  const target = targets[0] ?? "";

  if (!target) {
    return new Response(
      JSON.stringify({ error: "Invalid satellite parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    let res: Response | null = null;
    for (const t of targets) {
      res = await fetch(t);
      if (res.ok) break;
    }
    if (!res || !res.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream fetch failed (${res?.status ?? 0})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const buf = await res.arrayBuffer();

    return new Response(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        ...corsHeaders,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
