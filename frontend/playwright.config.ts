import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://127.0.0.1:3018", browserName: "chromium" },
  webServer: [
    {
      command: "node tests/mock-api.mjs",
      url: "http://127.0.0.1:18017/api/v1/listings",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- -p 3018",
      url: "http://127.0.0.1:3018",
      env: {
        DIRECTORY_API_URL: "http://127.0.0.1:18017",
        DIRECTORY_DEMO_MODE: "true",
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
