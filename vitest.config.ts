import { defineConfig } from 'vitest/config'
import { testEnv } from './tests/environment.ts'
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: testEnv(),
    fileParallelism: false,
    testTimeout: 15000,
  },
})
