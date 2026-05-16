import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'test-mcp-stdio-server': resolve(__dirname, 'src/main/test-mcp-stdio-server.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        },
        external: ['electron', 'node:sqlite', '@anthropic-ai/claude-agent-sdk', 'web-tree-sitter']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
