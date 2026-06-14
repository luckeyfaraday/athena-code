// Athena memory status reader. The server's memory layer writes a small
// status.json each turn; both the home footer (feature-plugins/home/athena-status.tsx)
// and the in-session ground strip (feature-plugins/session/athena-ground.tsx) read
// it. Factored here so the two surfaces never drift. Duplicated from the opencode
// memory modules on purpose: the tui package cannot depend on the opencode package.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type MemoryStatus = {
  loaded?: number
  recalled?: number
  empty_store?: boolean
}

export function readMemoryStatus(directory: string): MemoryStatus | null {
  const file = join(directory, ".context-workspace", "memory", "status.json")
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MemoryStatus
  } catch {
    return null
  }
}

export function formatMemoryStatus(status: MemoryStatus | null): string {
  if (!status || status.empty_store) return "memory empty"
  return `${status.loaded ?? 0} threads held · ${status.recalled ?? 0} recalled`
}
