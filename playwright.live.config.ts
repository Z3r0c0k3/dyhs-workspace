import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live',
  use: { baseURL: 'http://127.0.0.1:5175', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --mode live --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
});
