import { defineConfig } from '@playwright/test'
import { testEnv } from './tests/environment'
const env = testEnv()
Object.assign(process.env, env, { TEST_APP_SECRET: env.APP_SECRET })
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 90000,
  use: {
    actionTimeout: 10000,
    baseURL: env.APP_ORIGIN,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHROME === '1' ? 'chrome' : undefined,
  },
  webServer: {
    command: 'npm run dev -- --port 3107',
    url: env.APP_ORIGIN,
    timeout: 60000,
    env: { ...env, NEXT_OUTPUT_DIR: '.next-e2e' },
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
