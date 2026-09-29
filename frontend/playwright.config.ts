import { defineConfig } from "@playwright/test";

const webPort = Number(process.env.PLAYWRIGHT_PORT ?? "3018");
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an unprivileged TCP port");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: `http://127.0.0.1:${webPort}`, browserName: "chromium" },
  webServer: [
    {
      command: "node tests/mock-api.mjs",
      url: "http://127.0.0.1:18017/api/v1/listings",
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- -p ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      env: {
        DIRECTORY_API_URL: "http://127.0.0.1:18017",
        DIRECTORY_DEMO_MODE: "true",
        FEEDBACK_ENABLED: "true",
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
