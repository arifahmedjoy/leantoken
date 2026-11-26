import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  security: {
    allowedDomains: [
      { hostname: "leantoken.dev", protocol: "https" },
      { hostname: "www.leantoken.dev", protocol: "https" },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
