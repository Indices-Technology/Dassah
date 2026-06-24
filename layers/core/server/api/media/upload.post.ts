// POST /api/media/upload — proxy a multipart image upload to MarketX's Cloudinary
// uploader, so the browser doesn't make a cross-origin (CORS) call to MarketX.
// Returns { success, data: { url, public_id, type } }.

import { defineEventHandler, readMultipartFormData, createError } from 'h3'
// useRuntimeConfig is a Nitro auto-import (not exported by h3).

export default defineEventHandler(async (event) => {
  const auth = event.node.req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  const token = auth.slice(7)

  const config = useRuntimeConfig(event)
  const base = ((config.marketxApiUrl as string) || process.env.MARKETX_API_URL || '').replace(/\/+$/, '')
  const apiKey = (config.marketxApiKey as string) || process.env.MARKETX_API_KEY || ''
  if (!base) throw createError({ statusCode: 500, statusMessage: 'MarketX not configured' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file')
  if (!file?.data) throw createError({ statusCode: 400, statusMessage: 'No file provided' })

  const fd = new FormData()
  fd.append('file', new Blob([file.data], { type: file.type || 'application/octet-stream' }), file.filename || 'upload')

  const res = await fetch(`${base}/api/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-API-Key': apiKey },
    body: fd,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: (json as any)?.statusMessage || 'Upload failed',
    })
  }
  return json
})
