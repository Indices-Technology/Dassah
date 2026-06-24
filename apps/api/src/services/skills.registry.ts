import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'dassai-web' | 'dassai-seller-web'
type SkillChannel = 'buyer' | 'seller'

export interface SkillEntry {
  name: string
  description: string
  /** JSON Schema object (type:"object", properties, required) — passed directly to providers */
  parameters: Record<string, any>
  execute: (inputs: Record<string, unknown>) => Promise<unknown>
}

interface SkillModule {
  channels: SkillChannel[]
  description: string
  parameters: Record<string, any>
  execute: (inputs: Record<string, unknown>, context: { userToken: string; storeId?: string; storeSlug?: string; attachments?: unknown[] }) => Promise<unknown>
}

// ── Discovery ─────────────────────────────────────────────────────────────────

const SKILLS_DIR = path.join(__dirname, '../../skills')

function loadSkillModule(skillName: string): SkillModule {
  const skillPath = path.join(SKILLS_DIR, skillName, 'index.js')
  delete require.cache[require.resolve(skillPath)]
  return require(skillPath) as SkillModule
}

/**
 * Load all skills for a given channel. Context is closed over in each
 * entry's execute function, enabling hot-swap within the same turn.
 */
export function loadSkills(channel: Channel, context: { userToken: string; storeId?: string; storeSlug?: string; attachments?: unknown[] }): SkillEntry[] {
  // Seller mode loads both seller AND buyer skills — sellers can also shop.
  const allowedChannels: SkillChannel[] = channel === 'dassai-seller-web'
    ? ['seller', 'buyer']
    : ['buyer']

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const skills: SkillEntry[] = []

  for (const name of entries) {
    try {
      const mod = loadSkillModule(name)
      if (!mod.channels.some((c) => allowedChannels.includes(c))) continue

      skills.push({
        name,
        description: mod.description,
        parameters:  mod.parameters,
        execute: async (inputs) => {
          // Re-load at execution time for true hot-swap within a turn
          const fresh = loadSkillModule(name)
          return fresh.execute(inputs, context)
        },
      })
    } catch (err: any) {
      console.warn(`[skills] failed to load "${name}": ${err.message}`)
    }
  }

  return skills
}
