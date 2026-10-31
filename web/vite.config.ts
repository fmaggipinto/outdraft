import react from "@vitejs/plugin-react";
import type { Connect } from "vite";
import { defineConfig } from "vitest/config";
import { calendarFeed, FEED_PATH } from "./src/calendarFeed";
import { PREFIX, relay } from "./src/relay";

// Serve the same FPL Draft relay and deadlines feed locally that the Netlify
// Functions serve in production, so `npm run dev` and `npm run preview` work
// without Netlify.
const relayMiddleware: Connect.NextHandleFunction = async (req, res, next) => {
  const feed = req.url === FEED_PATH;
  if (!feed && !req.url?.startsWith(PREFIX)) return next();
  const out = feed ? await calendarFeed() : await relay(new Request(`http://localhost${req.url}`, { method: req.method }));
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await out.arrayBuffer()));
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: "fpl-relay",
      configureServer: (server) => void server.middlewares.use(relayMiddleware),
      configurePreviewServer: (server) => void server.middlewares.use(relayMiddleware),
    },
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
