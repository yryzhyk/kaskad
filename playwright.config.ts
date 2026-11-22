import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173/kaskad/',
    viewport: { width: 1600, height: 950 },
    acceptDownloads: true,
    trace: 'off',
    // UTF-8 локаль потрібна, щоб браузер зберігав кириличні імена завантажених файлів
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/kaskad/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
