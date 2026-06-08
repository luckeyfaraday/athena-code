import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { scoreMemory } from "./recall"
import { appendMemory, readAllMemoryEntries, readGlobalMemoryEntries, type MemoryEntry } from "./store"

const DEFAULT_READ_LIMIT = 12

export function writeMemoryFact(workspace: string, text: string, source = "agent") {
  return appendMemory(workspace, text, source)
}

export function resolveMemoryWorkspace(cwd = process.cwd()): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  const root = result.status === 0 ? result.stdout.trim() : ""
  return root ? resolve(root) : resolve(cwd)
}

export function addMemory(workspace: string, text: string, source = "cli") {
  return appendMemory(workspace, text, source)
}

export function listMemory(_workspace: string) {
  return readGlobalMemoryEntries()
}

export function readMemoryFacts(
  workspace: string,
  query = "",
  limit = DEFAULT_READ_LIMIT,
): { entries: MemoryEntry[]; total: number; query: string; empty_store: boolean } {
  const entries = readAllMemoryEntries(workspace)
  const normalized = query.trim()
  const boundedLimit = Math.max(1, Math.min(limit, 50))
  const selected = normalized
    ? scoreMemory(normalized, entries).map((scored) => scored.entry)
    : [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return {
    entries: selected.slice(0, boundedLimit),
    total: entries.length,
    query: normalized,
    empty_store: entries.length === 0,
  }
}
