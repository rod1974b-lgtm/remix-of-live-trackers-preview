import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const App = lazy(() => import("@/modelcast/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ModelCast — Compare Every Weather Model" },
      { name: "description", content: "Compare live forecasts from every major weather model, plus live lightning, storms, alerts and satellite." },
      { property: "og:title", content: "ModelCast — Compare Every Weather Model" },
      { property: "og:description", content: "Live multi-model weather forecasts and live trackers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = <div className="min-h-screen bg-slate-900" />;
  if (!mounted) return fallback;
  return (
    <Suspense fallback={fallback}>
      <App />
    </Suspense>
  );
}
