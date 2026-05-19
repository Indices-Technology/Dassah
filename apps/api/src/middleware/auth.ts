import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { MarketXUser } from '../types'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const token = authHeader.slice(7)
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'CHANGEME_generate_a_long_random_string',
    ) as MarketXUser

    if (!decoded.userId) {
      return res.status(401).json({ message: 'Invalid token payload' })
    }

    req.user = decoded
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
