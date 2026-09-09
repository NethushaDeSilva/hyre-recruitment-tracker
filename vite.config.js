// Vite config for Hyre — React plugin + "@" path alias pointing at src/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // `vite` on its own only serves the SPA — it has no idea `functions/`
    // exists. Locally, `/api/*` is served by a SEPARATE process, `wrangler
    // pages dev` (see `npm run dev:functions`), on port 8788. This proxy is
    // what stitches the two together so the app can call same-origin `/api/*`
    // paths in dev exactly as it does in production. Without both processes
    // running, every AI-backed feature (CV validation, extraction, filtering)
    // fails — see README.md.
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Route-level code-splitting (React.lazy in App.jsx) already keeps each
        // PAGE out of the initial download. This handles the other half: the
        // shared vendor code (Firebase, React) that used to sit inside that same
        // giant first-load bundle. Splitting it into its own chunk doesn't cut
        // first-visit bytes much (auth needs it immediately either way), but it
        // means Firebase/React — which change far less often than the app's own
        // code — stay cached in the browser across deploys, so returning users
        // (this is a tool staff open daily) mostly just re-fetch the small app
        // chunk instead of the whole vendor chunk every time we ship.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase") || id.includes("@firebase")) return "vendor-firebase";
          if (id.includes("react-router") || id.includes("/react-dom/") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
        },
      },
    },
  },
});
