import { H3Event, getHeader, createError } from 'h3'
import process from 'process'
// @ts-ignore: jsonwebtoken types not installed
const jwt = require('jsonwebtoken')

export function getUserFromEvent(event: H3Event): { id: string; [key: string]: any } | null {
  const authHeader = getHeader(event, 'Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const raw = authHeader.split(' ')[1]
  try {
    return jwt.verify(raw, process.env.JWT_SECRET || 'CHANGEME_generate_a_long_random_string') as any
  } catch {
    return null
  }
}

export function requireUser(event: H3Event) {
  const user = getUserFromEvent(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
