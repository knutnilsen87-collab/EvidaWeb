import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const repoEnv = loadEnv(mode, path.resolve(process.cwd(), "..", ".."), "");
  const appEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...appEnv, ...repoEnv };
  const apiProxyTarget = env.VITE_EVIDA_API_TARGET ?? env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:18080";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts"
    }
  };
});
