import { defineNuxtConfig } from 'nuxt/config'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')

export default defineNuxtConfig({
  alias: {
    '~~': root,
    '@@': root,
  },
  nitro: {
    alias: {
      '~~': root,
      '@@': root,
    },
  },
  extends: [
    '../../layers/core',
    '../../layers/chat',
    '../../layers/buyer',
    '../../layers/seller'
  ],
  modules: ['@nuxtjs/tailwindcss'],
  vite: {
    optimizeDeps: {
      include: ['debug', 'socket.io-client', 'engine.io-client'],
      exclude: ['ws'],
      esbuildOptions: {
        alias: {
          ws: 'ws/browser.js',
        },
      },
    },
    resolve: {
      alias: {
        ws: 'ws/browser.js',
      },
    },
  },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    public: {
      socketUrl: process.env.NUXT_PUBLIC_SOCKET_URL || 'http://localhost:4000',
      apiUrl: process.env.NUXT_PUBLIC_API_URL || 'http://localhost:4000'
    }
  }
})
