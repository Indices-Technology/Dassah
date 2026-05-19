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

  const secret = process.env.JWT_SECRET || 'CHANGEME_generate_a_long_random_string'
  const token = jwt.sign(payload, secret, { expiresIn: '24h' })

  return { token, user: payload }
})
