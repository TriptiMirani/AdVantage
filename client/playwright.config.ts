import { defineConfig } from "@playwright/test";

// Expects the dev server already running (npm run dev in client/) on port 5173.
export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:5173",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
