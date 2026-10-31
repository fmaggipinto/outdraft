import { defineConfig, devices } from "@playwright/test";

// Smoke test of the built app at phone width. The FPL Draft relay and the
// published Model files are served from recorded fixtures (see e2e/), so it
// never touches the live API.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4173", ...devices["Pixel 7"] },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
