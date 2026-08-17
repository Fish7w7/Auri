import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          // Preloads de renderers sandboxed precisam ser CommonJS no Electron.
          format: 'cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    }
  }
})
