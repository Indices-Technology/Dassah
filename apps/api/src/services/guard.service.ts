// Guard rail pipeline — runs on every AI turn.
//
// Three layers:
//   1. sanitizeInput  — strip prompt injection attempts before the AI sees the message
//   2. scanOutput     — redact PII from the AI's response before it reaches the client
//   3. checkToolInput — prevent the AI from using entity IDs it hallucinated (must come from JWT)

import { internalClient } from '../lib/internal'

// ── Prompt injection patterns ─────────────────────────────────────────────────

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (previous|prior|above|all) (instructions?|prompts?|rules?)/i,
  /disregard (previous|prior|above|all)/i,
  /you are now (a |an )?(different|new|evil|jailbroken|dan)/i,
  /act as (if you (are|were)|a |an )/i,
  /do anything now/i,
  /\[system\]/i,
  /<\|im_start\|>/i,
  /###\s*instruction/i,
  /reveal (your|the) (system prompt|instructions|training)/i,
  /print (your|the) (system prompt|instructions)/i,
  /what (are your|is your) (system prompt|instructions)/i,
]

// ── PII patterns ──────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,                                  label: '[EMAIL]' },
  { pattern: /\b(\+?234|0)[789]\d{9}\b/g,                                                               label: '[PHONE]' },
  { pattern: /\b4[0-9]{12}(?:[0-9]{3})?\b|\b5[1-5][0-9]{14}\b|\b3[47][0-9]{13}\b/g,                    label: '[CARD_NUMBER]' },
  { pattern: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,                                                        label: '[SSN]' },
  { pattern: /\b(?:NIN|BVN)[:\s]?\d{11}\b/i,                                                           label: '[ID_NUMBER]' },
]

// ── Public API ────────────────────────────────────────────────────────────────

export interface GuardResult {
  blocked:       boolean
  sanitized:     string
  triggerType?:  string
  triggerFragment?: string
}

/**
 * Checks the user's raw input for prompt injection.
 * Returns the (potentially sanitized) text plus block status.
 */
export function sanitizeInput(userId: string, text: string): GuardResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      // Log asynchronously — do not block
      internalClient.logGuardEvent({
        userId,
        type:          'PROMPT_INJECTION',
        inputFragment: text.slice(0, 500),
      })
      return {
        blocked:         true,
        sanitized:       text,
        triggerType:     'PROMPT_INJECTION',
        triggerFragment: text.slice(0, 200),
      }
    }
  }

  // Check for PII in the input — flag it but don't block (user may be giving their address)
  let sanitized = text
  for (const { pattern, label } of PII_PATTERNS) {
    if (pattern.test(sanitized)) {
      internalClient.logGuardEvent({
        userId,
        type:          'PII_DETECTED',
        inputFragment: text.slice(0, 500),
      })
      sanitized = sanitized.replace(pattern, label)
    }
  }

  return { blocked: false, sanitized }
}

/**
 * Redacts any PII that may have leaked into the AI's output.
 */
export function scanOutput(text: string): string {
  let result = text
  for (const { pattern, label } of PII_PATTERNS) {
    result = result.replace(pattern, label)
  }
  return result
}

/**
 * Ensures the AI is not using entity IDs it hallucinated.
 * Any ID the AI passes to a tool must either be absent (AI-chosen) or
 * match something provably from the authenticated user's session.
 *
 * Currently: productId must be a number (not a UUID or random string),
 * variantId must be a number. Add more rules here as the skill surface grows.
 */
export function checkToolInput(
  toolName:  string,
  input:     Record<string, unknown>,
  userId:    string,
): boolean {
  // productId must be an integer if present
  if ('productId' in input) {
    const pid = input.productId
    if (pid !== undefined && pid !== null && typeof pid !== 'number') {
      internalClient.logGuardEvent({
        userId,
        type:          'UNAUTHORIZED_TOOL',
        inputFragment: `${toolName}: productId="${pid}"`,
      })
      return false
    }
  }
  // variantId must be an integer if present
  if ('variantId' in input) {
    const vid = input.variantId
    if (vid !== undefined && vid !== null && typeof vid !== 'number') {
      internalClient.logGuardEvent({
        userId,
        type:          'UNAUTHORIZED_TOOL',
        inputFragment: `${toolName}: variantId="${vid}"`,
      })
      return false
    }
  }
  return true
}
