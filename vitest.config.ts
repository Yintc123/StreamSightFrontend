import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    env: {
      NODE_ENV: 'test',
      USE_MOCK: '1',
      SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
      SESSION_COOKIE_NAME: 'jko_session',
      SESSION_TTL_SECONDS: '2592000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      REDIS_URL: 'redis://localhost:6380/0',
      REDIS_KEY_PREFIX: 'jko-bff-test',
      APP_VERSION: '0.0.0-test',
      ENABLE_DEV_LOGIN: '1',
      NEXT_PUBLIC_APP_NAME: 'JKODonation',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/app/**/page.tsx',
      ],
    },
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
  },
})
