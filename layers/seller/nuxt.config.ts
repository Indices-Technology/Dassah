import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  name: 'seller-layer',
  extends: ['../core', '../chat'],
  routeRules: {
    '/seller/**': { ssr: false }
  }
})
