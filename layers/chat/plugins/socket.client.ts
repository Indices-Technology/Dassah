import { defineNuxtPlugin } from '#app'
import { useSocket } from '../composables/useSocket'

export default defineNuxtPlugin((nuxtApp) => {
  const { disconnect } = useSocket()

  nuxtApp.hook('app:unmount', () => {
    disconnect()
  })
})
