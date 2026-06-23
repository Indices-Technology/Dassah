// End-to-end test of the seller skills against live MarketX staging.
// Registers a throwaway seller, then runs each tool's execute() with a real token.
// Run:  MARKETX_API_URL=https://marketx.indicestech.com node test-seller-tools.cjs
const BASE = process.env.MARKETX_API_URL || 'https://marketx.indicestech.com'
process.env.MARKETX_API_URL = BASE // _lib reads this at require time

const rand = Math.random().toString(36).slice(2, 8)
const creds = {
  email: `dassah_test_${rand}@example.com`,
  username: `dassahtest${rand}`,
  password: 'Test1234!pass',
  confirmPassword: 'Test1234!pass',
  store_name: `Dassah Test ${rand}`,
  store_slug: `dassah-test-${rand}`,
}

const trunc = (o) => JSON.stringify(o, null, 2).slice(0, 700)

async function main() {
  console.log(`Base: ${BASE}\nRegistering throwaway seller "${creds.store_slug}"...`)
  const reg = await fetch(`${BASE}/api/auth/register-seller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  })
  const regBody = await reg.json().catch(() => ({}))
  if (!reg.ok) { console.error(`register-seller failed ${reg.status}:`, trunc(regBody)); process.exit(1) }
  const slug = regBody.store?.store_slug || creds.store_slug
  console.log(`✓ seller created. slug=${slug}`)

  // Log in for a clean, session-backed access token (register-seller's session is fire-and-forget).
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  })
  const loginBody = await login.json().catch(() => ({}))
  if (!login.ok || !loginBody.accessToken) { console.error(`login failed ${login.status}:`, trunc(loginBody)); process.exit(1) }
  const token = loginBody.accessToken
  console.log(`✓ logged in\n`)

  const ctx = { userToken: token, storeSlug: slug }
  const run = async (name, inputs) => {
    const skill = require(`./skills/${name}/index.js`)
    try {
      const r = await skill.execute(inputs, ctx)
      console.log(`✓ ${name} ${JSON.stringify(inputs)}\n${trunc(r)}\n`)
      return r
    } catch (e) {
      console.log(`✗ ${name} ${JSON.stringify(inputs)} → ${e.message}\n`)
    }
  }

  // read paths
  await run('store_profile', { action: 'view' })
  await run('seller_analytics', { timeframe: 'week' })
  await run('seller_wallet', { action: 'balance' })
  await run('seller_wallet', { action: 'bank_accounts' })
  await run('seller_orders', { action: 'list' })
  await run('store_management', { action: 'list' })

  // write paths
  const created = await run('store_management', {
    action: 'create', title: 'Dassah Test Tee', price: 5000, stock: 7, status: 'PUBLISHED',
  })
  if (created && created.productId) {
    const pid = String(created.productId)
    await run('store_management', { action: 'set_stock', productId: pid, stock: 12 })
    await run('store_management', { action: 'update_price', productId: pid, price: 6500 })
    await run('store_management', { action: 'list', status: 'PUBLISHED' })
  }
  await run('store_profile', { action: 'update', store_description: 'Updated by Dassah integration test.' })

  console.log('Done. (Throwaway seller — safe to ignore/delete.)')
}
main().catch((e) => { console.error(e); process.exit(1) })
