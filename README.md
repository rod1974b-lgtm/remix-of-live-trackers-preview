# Bolt Weather Companion

Import this Bolt ModelCast weather app and make it run. Stack: Vite React TypeScript Tailwind + Supabase (project elhkveswxaqplaptwrli) + Open-Meteo direct calls. Fix 2 things: 1) Header buttons Logs/Refresh/Live Trackers/Weather Models Live must always show icon + text on mobile, no hidden labels, wrap correctly at 390px. 2) Live Trackers modal tabs Precipitation/Warnings/Satellite/Earthquake/Hurricanes/Lightning all call Supabase Edge Functions at /functions/v1/: lightning-proxy, himawari-proxy, hurricane-tracker, weather-alerts, weather-proxy. Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY wiring, add clear loading, green/amber status dot, and user-visible error banner with HTTP status if proxy fails, never blank black screen. For Lightning canvas always draw grid + blue dot for user location even with 0 strikes, show message No strikes in this region in last 3 min - try Global, keep region buttons Nearby/Asia/Europe/Americas/Global always visible, poll every 15s. Keep Open-Meteo current/hourly/daily working as-is. After build, list which Supabase functions are reachable and which still need supabase functions deploy, and show console errors.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/39cfba8b-f43b-431b-9839-f75bc0f864f1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
