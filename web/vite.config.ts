import react from "@vitejs/plugin-react";
import type { Connect } from "vite";
import { defineConfig } from "vitest/config";
import { PREFIX, relay } from "./src/relay";

// Serve the same FPL Draft relay locally that the Netlify Function serves in
// production, so `npm run dev` and `npm run preview` work without Netlify.
const relayMiddleware: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith(PREFIX)) return next();
  const out = await relay(new Request(`http://localhost${req.url}`, { method: req.method }));
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
