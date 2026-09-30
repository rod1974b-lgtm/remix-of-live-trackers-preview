// Built-in satellite image proxy (replaces the stale external himawari-proxy
// edge function). Serves JMA Himawari and NOAA GOES imagery as image/jpeg so
// the satellite tab never depends on an external Supabase function deploy.
import { createFileRoute } from "@tanstack/react-router";

const VALID_SATS = new Set(["himawari", "jma", "jma-full", "goes-east", "goes-west", "meteosat"]);

// JMA publishes a new 10-minute slot; start 20 min behind now and walk back.
function jmaCandidates(area: "se1" | "fd_"): string[] {
  const out: string[] = [];
  const base = Date.now() - 20 * 60 * 1000;
  for (let k = 0; k < 6; k++) {
    const d = new Date(base - k * 10 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(Math.floor(d.getUTCMinutes() / 10) * 10).padStart(2, "0");
    out.push(`https://www.data.jma.go.jp/mscweb/data/himawari/img/${area}/${area}_trm_${hh}${mm}.jpg`);
  }
  return out;
}

const GOES: Record<string, string> = {
  "goes-east": "GOES19",
  "goes-west": "GOES18",
};

function targetsFor(sat: string): string[] {
  if (sat === "himawari") return [...jmaCandidates("se1"), ...jmaCandidates("fd_")];
  if (sat === "jma" || sat === "jma-full") return jmaCandidates("fd_");
  if (GOES[sat]) return [`https://cdn.star.nesdis.noaa.gov/${GOES[sat]}/ABI/FD/GEOCOLOR/1808x1808.jpg`];
  return [];
}

export const Route = createFileRoute("/api/public/satellite")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sat = url.searchParams.get("sat") ?? "himawari";

        if (!VALID_SATS.has(sat)) {
          return Response.json({ error: "Invalid satellite parameter" }, { status: 400 });
        }
        if (sat === "meteosat") {
          return Response.json(
            {
              error: "Meteosat image feed unavailable",
              mapUrl: "https://view.eumetsat.int/productviewer?v=default",
            },
            { status: 503 },
          );
        }

        const targets = targetsFor(sat);
        for (const target of targets) {
          try {
            const res = await fetch(target, { signal: AbortSignal.timeout(12_000) });
            if (res.ok) {
              const buf = await res.arrayBuffer();
              return new Response(buf, {
                headers: {
                  "Content-Type": "image/jpeg",
                  "Cache-Control": "public, max-age=300",
                  "Access-Control-Allow-Origin": "*",
                },
              });
            }
          } catch {
            // try the next candidate slot
          }
        }
        return Response.json({ error: "Upstream fetch failed" }, { status: 502 });
      },
    },
  },
});
