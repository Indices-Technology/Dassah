const { api, resolveStore, kobo, naira, verifiedMutation, previewResult } = require('../_lib')

// Seller wallet & payouts. Balances are stored in KOBO (÷100 for ₦). The withdraw
// endpoint compares `balance >= amount` on the kobo balance, so `amount` is sent in
// KOBO (naira × 100). Withdraw is a money movement — the agent must confirm first.

module.exports = {
  channels: ['seller'],
  description:
    "View the seller's wallet balance and earnings, list wallet transactions, preview a " +
    'payout (fees + net), list saved bank accounts, or request a withdrawal. Use for any ' +
    '"balance / earnings / payout / withdraw / cash out / bank account" request.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['balance', 'transactions', 'payout_preview', 'bank_accounts', 'withdraw'],
        description: 'Operation to perform (default: balance).',
      },
      amount:        { type: 'number', description: 'Amount in NAIRA (payout_preview / withdraw).' },
      bankAccountId: { type: 'string', description: 'Saved bank account ID to pay out to (withdraw).' },
      limit:         { type: 'number', description: 'Max transactions to list (default 20).' },
      preview:       { type: 'boolean', description: 'For withdraw: if true, return the real balance before→after WITHOUT moving money, so the seller can confirm. Apply on a second call with preview omitted.' },
    },
  },

  async execute(inputs, context) {
    const { action = 'balance' } = inputs
    const userToken = context?.userToken

    // ── balance ───────────────────────────────────────────────────────────────
    if (action === 'balance') {
      const { slug } = await resolveStore(context)
      const body = await api(`/api/commerce/wallet/store/${encodeURIComponent(slug)}`, { userToken })
      const w = body.data ?? {}
      return {
        storeName:       w.storeName,
        available:       kobo(w.balance),         // withdrawable now (₦)
        pending:         kobo(w.pendingBalance),  // held until orders clear (₦)
        totalEarned:     kobo(w.totalEarned),
        currency:        'NGN',
      }
    }

    // ── transactions ──────────────────────────────────────────────────────────
    if (action === 'transactions') {
      const limit = inputs.limit || 20
      const body = await api(`/api/commerce/wallet/transactions?limit=${limit}`, { userToken })
      const list = body.data?.transactions ?? body.data ?? []
      return {
        count: Array.isArray(list) ? list.length : 0,
        transactions: (Array.isArray(list) ? list : []).map((t) => ({
          id:        t.id,
          type:      t.type,
          amount:    kobo(t.amount),
          status:    t.status,
          reason:    t.reason ?? t.description ?? null,
          createdAt: t.created_at ?? t.createdAt,
        })),
        currency: 'NGN',
      }
    }

    // ── payout_preview ────────────────────────────────────────────────────────
    if (action === 'payout_preview') {
      if (inputs.amount == null) throw new Error('A payout preview needs an amount (in naira).')
      const koboAmt = Math.round(inputs.amount * 100)
      const body = await api(`/api/commerce/wallet/payout-preview?amount=${koboAmt}`, { userToken })
      const p = body.data ?? body
      // Pass through, normalising likely kobo fields to naira where present.
      return {
        requested: inputs.amount,
        fees:      p.totalFees != null ? kobo(p.totalFees) : (p.fees != null ? kobo(p.fees) : null),
        net:       p.net != null ? kobo(p.net) : null,
        raw:       p,
        currency:  'NGN',
      }
    }

    // ── bank_accounts ─────────────────────────────────────────────────────────
    if (action === 'bank_accounts') {
      const body = await api('/api/seller/bank-accounts', { userToken })
      const list = body.data ?? []
      return {
        count: Array.isArray(list) ? list.length : 0,
        accounts: (Array.isArray(list) ? list : []).map((a) => ({
          id:            a.id,
          bankName:      a.bank_name ?? a.bankName,
          accountName:   a.account_name ?? a.accountName,
          accountNumber: (a.account_number ?? a.accountNumber ?? '').replace(/.(?=.{4})/g, '•'),
          isDefault:     a.is_default ?? a.isDefault ?? false,
        })),
      }
    }

    // ── withdraw (money movement — verified) ────────────────────────────────────
    if (action === 'withdraw') {
      if (inputs.amount == null) throw new Error('A withdrawal needs an amount (in naira).')
      if (!inputs.bankAccountId) throw new Error('A withdrawal needs a bank account. List bank accounts first.')
      const koboAmt = Math.round(inputs.amount * 100)
      const { slug } = await resolveStore(context)
      const target = { type: 'wallet', id: slug, label: 'Wallet' }

      const readAvailable = async () => {
        const b = await api(`/api/commerce/wallet/store/${encodeURIComponent(slug)}`, { userToken })
        return kobo((b.data ?? {}).balance)   // available in ₦
      }

      let before
      try { before = await readAvailable() } catch (e) {
        return { kind: 'mutation', action: 'withdraw', success: false, verified: false, target, error: e.message,
          display: `I couldn't read your wallet balance, so no money was moved. ${e.message}` }
      }

      if (before < inputs.amount) {
        return { kind: 'mutation', action: 'withdraw', success: false, verified: false, target,
          error: `Insufficient balance: available ${naira(before)}, requested ${naira(inputs.amount)}.`,
          display: `That withdrawal wasn't made — your available balance is ${naira(before)}, which is less than ${naira(inputs.amount)}.` }
      }

      if (inputs.preview) {
        return previewResult({ action: 'withdraw', target,
          change: { field: 'available balance', before: naira(before), after: naira(before - inputs.amount) } })
      }

      const result = await verifiedMutation({
        action: 'withdraw', target,
        change: { field: 'available balance', before: naira(before), expected: naira(before - inputs.amount) },
        execute: () => api('/api/commerce/wallet/withdraw', {
          userToken, method: 'POST', body: { amount: koboAmt, bankAccount: inputs.bankAccountId },
        }),
        verify: async () => {
          // Read-after-write: available must have dropped by ~the amount. Conservative —
          // if it didn't visibly drop we report UNCONFIRMED rather than claim success.
          const after = await readAvailable()
          return { ok: (before - after) >= inputs.amount - 1, actual: naira(after) }
        },
      })
      result.display = result.verified
        ? `Withdrawal of ${naira(inputs.amount)} confirmed — available balance ${naira(before)} → ${result.change.actual}.`
        : `Withdrawal of ${naira(inputs.amount)} could NOT be confirmed against your balance — please check your wallet before retrying, so you don't double-withdraw. ${result.error}`
      result.message = result.display
      return result
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
