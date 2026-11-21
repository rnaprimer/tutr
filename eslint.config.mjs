import next from 'eslint-config-next/core-web-vitals'
import ts from 'eslint-config-next/typescript'
const config = [
  ...next,
  ...ts,
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      '.next-build/**',
      'next-env.d.ts',
      '.local/**',
      'playwright-report/**',
      'test-results/**',
      'work/**',
      'outputs/**',
    ],
  },
]
export default config
