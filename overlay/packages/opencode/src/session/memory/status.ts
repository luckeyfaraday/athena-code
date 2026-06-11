import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { readAllMemoryEntries } from "./store"
import { recallResult } from "./recall"

export interface MemoryStatus {
  loaded: number
  recalled: number
  empty_store: boolean
  updated_at: string
}

export function statusPath(workspace: string): string {
  return join(resolve(workspace), ".context-workspace", "memory", "status.json")
}

export function computeMemoryStatus(workspace: string, query: string): MemoryStatus {
  const entries = readAllMemoryEntries(workspace)
  return {
    loaded: entries.length,
    recalled: recallResult(workspace, query).count,
    empty_store: entries.length === 0,
    updated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  }
}

export function writeMemoryStatus(workspace: string, query: string): MemoryStatus {
  const status = computeMemoryStatus(workspace, query)
  const file = statusPath(workspace)
  try {
    mkdirSync(join(resolve(workspace), ".context-workspace", "memory"), { recursive: true })
    writeFileSync(file, JSON.stringify(status, null, 2) + "\n", "utf8")
  } catch {
    // Status is only for UX; memory retrieval must continue if this sidecar
    // cannot be refreshed.
  }
  return status
}

export function readMemoryStatus(workspace: string): MemoryStatus | null {
  const file = statusPath(workspace)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MemoryStatus
  } catch {
    return null
  }
}

export function formatMemoryStatus(status: Pick<MemoryStatus, "loaded" | "recalled" | "empty_store"> | null): string {
  if (!status || status.empty_store) return "memory empty"
  return `loaded ${status.loaded} memories · recalled ${status.recalled} this turn`
}
