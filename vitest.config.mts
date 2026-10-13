import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws unless resolved with the react-server condition, which Vitest
    // does not use; point it at the package's own empty module so server code can be tested.
    alias: { "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
