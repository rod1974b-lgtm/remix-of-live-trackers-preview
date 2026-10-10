// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ["**/*.{js,css,png,ico,svg,woff2}"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "modelcast-pages", networkTimeoutSeconds: 4 },
            },
            {
              urlPattern: ({ url }) => url.hostname.endsWith("open-meteo.com"),
              handler: "NetworkFirst",
              options: {
                cacheName: "modelcast-weather",
                networkTimeoutSeconds: 8,
                expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
              },
            },
            {
              urlPattern: ({ url }) => url.hostname.includes("fonts.g"),
              handler: "CacheFirst",
              options: { cacheName: "modelcast-fonts", expiration: { maxEntries: 20 } },
            },
          ],
        },
      }),
    ],
  },
});
