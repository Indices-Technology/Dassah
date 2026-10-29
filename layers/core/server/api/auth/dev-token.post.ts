import { defineEventHandler, createError } from 'h3'
import jwt from 'jsonwebtoken'

export default defineEventHandler((event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const payload = {
    id: 'dev_usr_12345',
    email: 'test@marketx.indicestech.com',
    name: 'Dev User',
    role: 'customer'
  }

  // No fallback: verification rejects HS256 without JWT_SECRET, so a default
  // here would only mint tokens that fail. Dies with the HS256 cutover.
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: 'Set JWT_SECRET to use dev tokens' })
  }
  const token = jwt.sign(payload, secret, { expiresIn: '24h' })

  return { token, user: payload }
})
