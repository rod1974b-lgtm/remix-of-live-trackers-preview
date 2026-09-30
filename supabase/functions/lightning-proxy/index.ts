const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Strike {
  lat: number;
  lon: number;
  time: number;
}

const WS_SERVERS = [
  "wss://ws1.blitzortung.org",
  "wss://ws2.blitzortung.org",
  "wss://ws7.blitzortung.org",
  "wss://ws8.blitzortung.org",
  "wss://ws9.blitzortung.org",
];

function tryParseStrike(data: string | ArrayBuffer): Strike | null {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else {
    text = new TextDecoder().decode(new Uint8Array(data));
  }

  try {
    const strike = JSON.parse(text);
    if (
      strike &&
      typeof strike.lat === "number" &&
      typeof strike.lon === "number" &&
      isFinite(strike.lat) &&
      isFinite(strike.lon)
    ) {
      return {
        lat: strike.lat,
        lon: strike.lon,
        time: typeof strike.time === "number"
          ? (strike.time > 10_000_000_000 ? Math.floor(strike.time / 1_000_000) : strike.time)
          : Date.now(),
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

async function collectStrikesWS(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number,
  waitMs: number,
  serverIdx: number,
): Promise<{ strikes: Strike[]; connected: boolean }> {
  return new Promise((resolve) => {
    const collected: Strike[] = [];
    let connected = false;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* ignore */ }
      resolve({ strikes: collected, connected });
    };

    let ws: WebSocket | null = null;
    const serverUrl = WS_SERVERS[serverIdx % WS_SERVERS.length];

    try {
      ws = new WebSocket(serverUrl);
      ws.binaryType = "arraybuffer";
    } catch {
      resolve({ strikes: [], connected: false });
      return;
    }

    const connectTimeout = setTimeout(() => {
      if (!connected) finish();
    }, 3000);

    ws.onopen = () => {
      connected = true;
      clearTimeout(connectTimeout);
      try { ws!.send('{"a": 111}'); } catch { /* ignore */ }
      setTimeout(finish, waitMs);
    };

    ws.onmessage = (evt: MessageEvent) => {
      const strike = tryParseStrike(evt.data);
      if (strike) {
        collected.push(strike);
        if (collected.length > 800) collected.shift();
      }
    };

    ws.onerror = () => { clearTimeout(connectTimeout); };
    ws.onclose = () => { clearTimeout(connectTimeout); finish(); };
    setTimeout(finish, waitMs + 2000);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const latMin = parseFloat(url.searchParams.get("latMin") ?? "-90");
  const latMax = parseFloat(url.searchParams.get("latMax") ?? "90");
  const lonMin = parseFloat(url.searchParams.get("lonMin") ?? "-180");
  const lonMax = parseFloat(url.searchParams.get("lonMax") ?? "180");

  try {
    const serverIdx = Math.floor(Math.random() * WS_SERVERS.length);
    const { strikes, connected } = await collectStrikesWS(
      latMin, latMax, lonMin, lonMax, 4000, serverIdx,
    );

    const filtered = strikes.filter(
      (s) => s.lat >= latMin && s.lat <= latMax && s.lon >= lonMin && s.lon <= lonMax,
    );

    return new Response(
      JSON.stringify({
        strikes: filtered.map((s) => ({ lat: s.lat, lon: s.lon, time: s.time })),
        total: filtered.length,
        connected,
        server: WS_SERVERS[serverIdx % WS_SERVERS.length],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        strikes: [],
        total: 0,
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
