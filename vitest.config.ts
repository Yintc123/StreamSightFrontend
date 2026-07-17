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
    // Vitest's test.env merges OVER process.env (i.e. test.env wins on
    // collision). Use fallback pattern so an explicit REDIS_* env takes
    // precedence when set; the default (6379) matches infra/docker-compose.yml
    // + infra/.env and the app runtime default (src/lib/config.ts), so a bare
    // `pnpm test` against `docker compose up -d redis` connects with no env.
    env: {
      NODE_ENV: 'test',
      USE_MOCK: '1',
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? 'test-session-secret-must-be-32-chars-long',
      SESSION_COOKIE_NAME: 'streamsight_session',
      SESSION_TTL_SECONDS: '2592000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? '',
      REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX ?? 'streamsight-bff-test',
      APP_VERSION: '0.0.0-test',
      NEXT_PUBLIC_APP_NAME: 'StreamSight',
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
