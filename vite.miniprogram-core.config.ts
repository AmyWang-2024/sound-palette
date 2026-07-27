import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(projectRoot, 'packages/core/src/index.ts'),
      formats: ['cjs'],
      fileName: () => 'shared-core.js',
    },
    minify: true,
    outDir: resolve(projectRoot, 'miniprogram/vendor'),
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
})
