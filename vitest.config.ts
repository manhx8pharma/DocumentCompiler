import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['server/**/*.{test,spec}.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@db': path.resolve(import.meta.dirname, 'db'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
});
