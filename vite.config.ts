import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

function hasGlobbedMigrations(root: string): boolean {
  try { return readdirSync(join(root, "migrations")).some(isMigrationFile); } catch { return false; }
}
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      const mod = await server.ssrLoadModule("/src/lib/db.ts") as any;
      if (mod.ensureDbReady) await mod.ensureDbReady();
    },
  };
}
export default defineConfig({
  server: { host: "0.0.0.0", port: 8080, strictPort: true },
  preview: { host: "127.0.0.1", port: 8081, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [pgliteBootstrapPlugin(), tailwindcss(), tanstackStart(), nitro(process.env.HUB_BUILD ? { preset: "node-server" } : {}), viteReact()],
});
