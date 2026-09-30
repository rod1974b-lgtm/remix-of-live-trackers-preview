const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StormInfo {
  id: string;
  name: string;
  type: string;
  category: string;
  latitude: number;
  longitude: number;
  intensityMph: number;
  intensityKts: number;
  pressureMb: number;
  movement: string;
  speedMph: number;
  updateTime: string;
  basin: string;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return match ? match[1].trim() : "";
}

function extractNum(xml: string, tag: string): number {
  const val = extractTag(xml, tag);
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

async function fetchStormList(): Promise<string[]> {
  const res = await fetch("https://ftp.nhc.noaa.gov/atcf/adv/", {
    headers: { "User-Agent": "ModelCast/1.0" },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const files = [...html.matchAll(/href=["'](?:[^"']*\/)?([a-z]{2}\d{4}_info\.xml)["']/gi)]
    .map((match) => match[1]);
  return [...new Set(files)];
}

async function fetchStorm(file: string): Promise<StormInfo | null> {
  try {
    const res = await fetch(`https://ftp.nhc.noaa.gov/atcf/adv/${file}`, {
      headers: { "User-Agent": "ModelCast/1.0" },
    });
    if (!res.ok) return null;
    const xml = await res.text();

    const id = extractTag(xml, "atcfID");
    const name = extractTag(xml, "systemName");
    const type = extractTag(xml, "systemType");
    const category = extractTag(xml, "systemSaffirSimpsonCategory");

    if (!name || name === "N/A") return null;

    const lat = extractNum(xml, "centerLocLatitude");
    const lon = extractNum(xml, "centerLocLongitude");
    const intensityMph = extractNum(xml, "systemIntensityMph");
    const intensityKts = extractNum(xml, "systemIntensityKts");
    const pressureMb = extractNum(xml, "systemMslpMb");
    const speedMph = extractNum(xml, "systemSpeedMph");
    const movement = extractTag(xml, "systemDirectionOfMotion");
    const updateTime = extractTag(xml, "messageDateTimeUTC");

    const basinCode = file.substring(0, 2);
    const basinMap: Record<string, string> = {
      al: "Atlantic",
      ep: "Eastern Pacific",
      cp: "Central Pacific",
      wp: "Western Pacific",
      io: "Indian Ocean",
    };

    return {
      id,
      name,
      type,
      category: category === "N/A" ? "—" : category,
      latitude: lat,
      longitude: lon,
      intensityMph,
      intensityKts,
      pressureMb,
      movement,
      speedMph,
      updateTime,
      basin: basinMap[basinCode] ?? basinCode.toUpperCase(),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const files = await fetchStormList();
    if (files.length === 0) {
      return new Response(
        JSON.stringify({ storms: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stormPromises = files.map((f) => fetchStorm(f));
    const results = await Promise.all(stormPromises);
    const storms = results.filter((s): s is StormInfo => s !== null);

    return new Response(
      JSON.stringify({ storms }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, storms: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
