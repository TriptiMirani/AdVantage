import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin requests in dev, so the API needs no CORS setup.
    proxy: {
      "/analytics": "http://localhost:3001",
      "/campaigns": "http://localhost:3001",
    },
  },
});
