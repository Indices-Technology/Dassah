import { defineNuxtRouteMiddleware, navigateTo } from '#app'
import { useAuth } from '../composables/useAuth'

export default defineNuxtRouteMiddleware((to) => {
  const { token, initAuth } = useAuth()
  initAuth()

  if (!token.value && to.path !== '/') {
    return navigateTo('/')
  }
})
