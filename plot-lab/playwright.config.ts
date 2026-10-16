import { defineConfig } from "@playwright/test";

// Every e2e test runs twice: against the production build, and against the dev server (React StrictMode on,
// which mounts components and effects twice — that catches lifetime bugs a build never shows).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  projects: [
    { name: "build", use: { baseURL: "http://localhost:4173" } },
    { name: "dev", use: { baseURL: "http://localhost:5199" } },
  ],
  webServer: [
    { command: "npm run build && npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: true, timeout: 120_000 },
    { command: "npx vite --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: true, timeout: 120_000 },
  ],
});
