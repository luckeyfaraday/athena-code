// Native durable memory for athena-code.
//
// This has no dependency on opencode internals or on the Athena HTTP backend, so
// the hot path (read on snapshot build, append on memory_write) is a local file
// read, never a network round-trip. User memory is global across folders under
// ~/.athena-code; project memory stays readable as workspace-local context.

import { createHash, randomBytes } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export interface MemoryEntry {
  id: string
  text: string
  created_at: string
  hash: string
  source: string
}

const PROJECT_MEMORY_SUBDIR = join(".context-workspace", "memory")
const ENTRIES_FILE = "entries.jsonl"

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z")
}

export function randomHex(chars: number): string {
  return randomBytes(Math.ceil(chars / 2))
    .toString("hex")
    .slice(0, chars)
}

// Head+tail truncation with a visible marker, mirroring the backend's budgeting
// so a native snapshot renders identically to the legacy one.
export function bounded(value: string, maxChars: number): { text: string; truncated: boolean } {
  const text = value.trim()
  if (text.length <= maxChars) return { text, truncated: false }
  const head = Math.floor(maxChars * 0.7)
  const tail = maxChars - head
  const marker = "\n\n[...truncated by Athena immersive context budget...]\n\n"
  return {
    text: `${text.slice(0, head).trimEnd()}${marker}${text.slice(text.length - tail).trimStart()}`,
    truncated: true,
  }
}

export function memoryDir(workspace: string): string {
  return join(resolve(workspace), PROJECT_MEMORY_SUBDIR)
}

export function globalMemoryDir(): string {
  return join(resolve(process.env.ATHENA_CODE_HOME || join(homedir(), ".athena-code")), "memory")
}

function readEntriesFile(file: string): MemoryEntry[] {
  if (!existsSync(file)) return []
  const out: MemoryEntry[] = []
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as MemoryEntry)
    } catch {
      // Skip a corrupt line rather than failing the whole read.
    }
  }
  return out
}

export function readMemoryEntries(_workspace: string): MemoryEntry[] {
  return readGlobalMemoryEntries()
}

export function readProjectMemoryEntries(workspace: string): MemoryEntry[] {
  return readEntriesFile(join(memoryDir(workspace), ENTRIES_FILE))
}

export function readGlobalMemoryEntries(): MemoryEntry[] {
  return readEntriesFile(join(globalMemoryDir(), ENTRIES_FILE))
}

export function readAllMemoryEntries(workspace: string): MemoryEntry[] {
  const seen = new Set<string>()
  const out: MemoryEntry[] = []
  for (const entry of [...readGlobalMemoryEntries(), ...readProjectMemoryEntries(workspace)]) {
    if (seen.has(entry.hash)) continue
    seen.add(entry.hash)
    out.push(entry)
  }
  return out
}

// Append a durable memory. Returns null when the text is empty or a byte-identical
// entry already exists.
export function appendMemory(_workspace: string, text: string, source = "agent"): MemoryEntry | null {
  return appendGlobalMemory(text, source)
}

export function appendGlobalMemory(text: string, source = "agent"): MemoryEntry | null {
  return appendMemoryFile(globalMemoryDir(), text, source)
}

export function appendProjectMemory(workspace: string, text: string, source = "agent"): MemoryEntry | null {
  return appendMemoryFile(memoryDir(workspace), text, source)
}

function appendMemoryFile(dir: string, text: string, source: string): MemoryEntry | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const hash = sha256(trimmed)
  if (readEntriesFile(join(dir, ENTRIES_FILE)).some((entry) => entry.hash === hash)) return null
  const entry: MemoryEntry = { id: `mem_${randomHex(24)}`, text: trimmed, created_at: nowIso(), hash, source }
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, ENTRIES_FILE), JSON.stringify(entry) + "\n", "utf8")
  return entry
}

export function renderMemory(workspace: string, maxChars: number): { text: string; truncated: boolean } {
  const body = readAllMemoryEntries(workspace)
    .map((entry) => `- ${entry.text}`)
    .join("\n")
  return bounded(body, maxChars)
}
