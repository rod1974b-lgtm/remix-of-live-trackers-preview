// Built-in TanStack Start server route for AI weather picture analysis
// Keeps LOVABLE_API_KEY secure on the server and analyzes uploaded sky/weather photos.
import { createFileRoute } from "@tanstack/react-router";

const VALID_CONDITIONS = [
  "sunny",
  "partly_cloudy",
  "overcast",
  "drizzle",
  "light_rain",
  "moderate_rain",
  "heavy_rain",
  "extreme_rain",
  "thunderstorm",
  "windy",
  "hazy",
  "foggy",
  "hot_humid",
] as const;

export const Route = createFileRoute("/api/public/analyze-weather-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const apiKey = process.env["LOVABLE_API_KEY"];
          if (!apiKey) {
            return Response.json(
              { error: "AI service is currently unconfigured (missing API key)." },
              { status: 500 }
            );
          }

          const body = await request.json().catch(() => ({}));
          const image = body?.image;
          const location = body?.locationName || "the current location";

          if (!image || typeof image !== "string") {
            return Response.json(
              { error: "Please provide a valid image data URL." },
              { status: 400 }
            );
          }

          const systemPrompt = `You are a certified professional meteorologist analyzing this user-submitted photo taken in ${location}.
CRITICAL INSTRUCTION: Focus EXCLUSIVELY on sky and atmospheric weather conditions. Ignore buildings, people, vehicles, furniture, or indoor items except where they directly show weather evidence (e.g., wet ground, standing puddles, rain streaks, wind sway).

Analyze:
1. Sky and cloud cover (cumulus, cumulonimbus, stratus, cirrus, overcast, or clear blue sky).
2. Visible precipitation (rain shafts, puddles, wet pavement, drizzle, storms).
3. Atmospheric clarity (haze, fog, smoke, bright harsh sun, high humidity).

If the image is completely indoors or shows no discernible weather/sky, politely note that the image does not show outdoor sky conditions.

Respond ONLY with a valid JSON object matching this exact structure:
{
  "simpleExplanation": "1 or 2 clear, everyday sentences describing only the current sky/weather visible and what condition is developing or likely approaching.",
  "conditionId": "one of: sunny, partly_cloudy, overcast, drizzle, light_rain, moderate_rain, heavy_rain, extreme_rain, thunderstorm, windy, hazy, foggy, hot_humid",
  "confidence": 85
}`;

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: systemPrompt },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
              response_format: { type: "json_object" },
              max_tokens: 300,
            }),
          });

          if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            return Response.json(
              { error: "AI gateway error while analyzing image", details: errText },
              { status: aiResponse.status }
            );
          }

          const aiData = await aiResponse.json();
          const rawContent = aiData?.choices?.[0]?.message?.content || "{}";
          let parsed: { simpleExplanation?: string; conditionId?: string; confidence?: number } = {};

          try {
            parsed = JSON.parse(rawContent);
          } catch {
            parsed = {
              simpleExplanation: rawContent.slice(0, 200),
              conditionId: "partly_cloudy",
              confidence: 50,
            };
          }

          const conditionId = (VALID_CONDITIONS as readonly string[]).includes(parsed.conditionId || "")
            ? (parsed.conditionId as string)
            : "partly_cloudy";

          return Response.json({
            success: true,
            explanation: parsed.simpleExplanation || "Clouds and atmospheric conditions observed in the sky.",
            conditionId,
            confidence: parsed.confidence ?? 80,
          });
        } catch (err: any) {
          return Response.json(
            { error: err?.message || "Failed to analyze image" },
            { status: 500 }
          );
        }
      },
    },
  },
});
