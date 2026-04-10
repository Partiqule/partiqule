import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Target older iOS WKWebViews (iOS 15+) so Capacitor builds don't
    // ship unsupported JS features. Mobile Safari ≥ 15 is the floor.
    target: ["es2020", "safari15"],
  },
  server: {
    port: 3000,
    proxy: {
      "/analyze": "http://localhost:3001",
      "/health": "http://localhost:3001"
    }
  }
});
