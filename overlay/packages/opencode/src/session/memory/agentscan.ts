// Cross-agent session scanner for athena-code (Slice 3).
//
// Ports the Sessions-search adapters to TypeScript so the global session index
// covers every local coding agent, not just athena's own turns: Claude Code
// (~/.claude/projects JSONL), Codex (~/.codex/sessions rollout JSONL), opencode
// (opencode.db, read-only), and Hermes (~/.hermes/sessions JSON/JSONL). Each
// source is guarded by an existence check, so machines with only some agents
// index what exists and nothing errors.
//
// Conversation text only: user/assistant messages plus reasoning. Tool calls,
// tool results, and synthetic boilerplate are deliberately excluded.
//
// Incrementality mirrors Sessions-search: a cheap per-session fingerprint
// (file mtime+size, or opencode's time_updated) is stored in the index, and a
// rescan parses only sessions whose fingerprint changed. Scans run in the
// background and yield to the event loop between sessions so the first full
// scan never freezes the server.

import { Database } from "bun:sqlite"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  athenaOwnedSessionIds,
  indexScannedSessions,
  readSourceFingerprints,
  type ScannedSession,
} from "./sessionindex"

const BATCH_SIZE = 20
const YIELD_EVERY = 50
const SCAN_INTERVAL_MS = 15 * 60_000

export interface ScanRoots {
  claude: string
  codex: string
  hermes: string
  opencodeDb: string
}

export function defaultScanRoots(): ScanRoots {
  const home = homedir()
  const xdgData = process.env.XDG_DATA_HOME || join(home, ".local", "share")
  return {
    claude: process.env.ATHENA_SCAN_CLAUDE_DIR || join(home, ".claude", "projects"),
    codex: process.env.ATHENA_SCAN_CODEX_DIR || join(home, ".codex", "sessions"),
    hermes: process.env.ATHENA_SCAN_HERMES_DIR || join(home, ".hermes", "sessions"),
    opencodeDb: process.env.ATHENA_SCAN_OPENCODE_DB || join(xdgData, "opencode", "opencode.db"),
  }
}

interface SourceKey {
  sourceId: string
  sourcePath: string
  fingerprint: string
}

export interface ScanStats {
  agent: string
  scanned: number
  indexed: number
  skipped: number
  newMessages: number
  error?: string
}

// --- shared helpers ---------------------------------------------------------

function fileFingerprint(path: string): string {
  const st = statSync(path)
  return `${st.mtimeMs}:${st.size}`
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

// Best-effort conversion of an agent timestamp to an ISO string. Handles
// ISO-8601 strings and numeric epochs in seconds or milliseconds; returns null
// when missing or unparseable rather than throwing.
function parseTs(value: unknown): string | null {
  if (value === null || value === undefined) return null
  let epochMs: number | null = null
  if (typeof value === "number" && Number.isFinite(value)) {
    epochMs = value > 1e11 ? value : value * 1000
  } else if (typeof value === "string") {
    const s = value.trim()
    if (!s) return null
    if (/^\d+$/.test(s)) {
      const n = Number(s)
      epochMs = n > 1e11 ? n : n * 1000
    } else {
      const parsed = Date.parse(s)
      if (Number.isNaN(parsed)) return null
      epochMs = parsed
    }
  }
  if (epochMs === null) return null
  try {
    return new Date(epochMs).toISOString()
  } catch {
    return null
  }
}

// Each JSON object from a JSONL file, skipping blank/garbled lines.
function readJsonl(path: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = []
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === "object" && !Array.isArray(obj)) objects.push(obj)
    } catch {
      continue
    }
  }
  return objects
}

function walkFiles(root: string, matches: (name: string) => boolean): string[] {
  const found: string[] = []
  const pending = [root]
  while (pending.length > 0) {
    const dir = pending.pop() as string
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && matches(entry.name)) found.push(path)
    }
  }
  return found
}

type Scanned = { role: string; ts: string; text: string }

function message(role: string, text: string, ts: string | null, seq: number): Scanned {
  return { role, text, ts: ts ?? `seq:${seq}` }
}

// --- Claude Code: ~/.claude/projects/<enc-cwd>/<uuid>.jsonl ------------------

function claudeBlockText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as Record<string, unknown>
    if (b.type === "text" && typeof b.text === "string" && b.text) parts.push(b.text)
    else if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking) parts.push(b.thinking)
    // tool_use / tool_result / image blocks are intentionally skipped.
  }
  return parts.join("\n")
}

function claudeKeys(root: string): SourceKey[] {
  const keys: SourceKey[] = []
  let projects: string[]
  try {
    projects = readdirSync(root)
  } catch {
    return keys
  }
  for (const project of projects) {
    let files: string[]
    try {
      files = readdirSync(join(root, project))
    } catch {
      continue
    }
    for (const name of files) {
      if (!name.endsWith(".jsonl")) continue
      const path = join(root, project, name)
      try {
        keys.push({ sourceId: stem(name), sourcePath: path, fingerprint: fileFingerprint(path) })
      } catch {
        continue
      }
    }
  }
  return keys
}

function claudeLoad(key: SourceKey): ScannedSession {
  const messages: Scanned[] = []
  let project = ""
  for (const obj of readJsonl(key.sourcePath)) {
    if (obj.type !== "user" && obj.type !== "assistant") continue
    if (!project && typeof obj.cwd === "string") project = obj.cwd
    const msg = obj.message
    if (!msg || typeof msg !== "object") continue
    const m = msg as Record<string, unknown>
    const text = claudeBlockText(m.content).trim()
    if (!text) continue
    const role = typeof m.role === "string" ? m.role : (obj.type as string)
    messages.push(message(role, text, parseTs(obj.timestamp), messages.length))
  }
  return { ...key, workspace: project, messages }
}

// --- Codex: ~/.codex/sessions/Y/M/D/rollout-*.jsonl --------------------------

function codexContentText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as Record<string, unknown>
    if ((b.type === "input_text" || b.type === "output_text") && typeof b.text === "string" && b.text) {
      parts.push(b.text)
    }
  }
  return parts.join("\n")
}

function codexKeys(root: string): SourceKey[] {
  const keys: SourceKey[] = []
  for (const path of walkFiles(root, (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"))) {
    try {
      // The file stem keys the fingerprint; the real session id comes from
      // session_meta during the full parse, keeping key listing one stat call.
      keys.push({ sourceId: stem(path.slice(path.lastIndexOf("/") + 1)), sourcePath: path, fingerprint: fileFingerprint(path) })
    } catch {
      continue
    }
  }
  return keys
}

function codexLoad(key: SourceKey): ScannedSession {
  const messages: Scanned[] = []
  let sessionId = key.sourceId
  let project = ""
  for (const obj of readJsonl(key.sourcePath)) {
    const payload = obj.payload
    if (!payload || typeof payload !== "object") continue
    const p = payload as Record<string, unknown>
    if (obj.type === "session_meta") {
      if (typeof p.id === "string" && p.id) sessionId = p.id
      if (typeof p.cwd === "string" && p.cwd) project = p.cwd
      continue
    }
    // event_msg mirrors response_item messages, so only the latter is indexed;
    // encrypted reasoning items carry no plaintext and are skipped.
    if (obj.type !== "response_item" || p.type !== "message") continue
    if (p.role !== "user" && p.role !== "assistant") continue
    const text = codexContentText(p.content).trim()
    if (!text) continue
    messages.push(message(p.role, text, parseTs(obj.timestamp), messages.length))
  }
  return { ...key, sessionId, workspace: project, messages }
}

// --- Hermes: ~/.hermes/sessions/*.json and *.jsonl ----------------------------

function hermesText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === "string") parts.push(block)
    else if (block && typeof block === "object" && typeof (block as Record<string, unknown>).text === "string") {
      parts.push((block as Record<string, unknown>).text as string)
    }
  }
  return parts.join("\n")
}

function hermesMessage(raw: Record<string, unknown>, seq: number): Scanned | null {
  const role = raw.role
  if (role !== "user" && role !== "assistant") return null
  let text = hermesText(raw.content).trim()
  if (role === "assistant" && raw.reasoning) {
    const reasoning = hermesText(raw.reasoning).trim()
    if (reasoning) text = `${reasoning}\n${text}`.trim()
  }
  if (!text) return null
  return message(role, text, parseTs(raw.timestamp), seq)
}

function hermesKeys(root: string): SourceKey[] {
  const keys: SourceKey[] = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return keys
  }
  for (const entry of entries) {
    if (!entry.isFile() || !(entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))) continue
    const path = join(root, entry.name)
    try {
      // Filenames are unique within the sessions dir, so the name is the id.
      keys.push({ sourceId: entry.name, sourcePath: path, fingerprint: fileFingerprint(path) })
    } catch {
      continue
    }
  }
  return keys
}

function hermesLoad(key: SourceKey): ScannedSession {
  let project = ""
  let rawMessages: unknown[] = []
  if (key.sourcePath.endsWith(".jsonl")) {
    rawMessages = readJsonl(key.sourcePath)
  } else {
    try {
      const data = JSON.parse(readFileSync(key.sourcePath, "utf8"))
      if (Array.isArray(data)) rawMessages = data
      else if (data && typeof data === "object") {
        const d = data as Record<string, unknown>
        if (typeof d.platform === "string") project = d.platform
        if (Array.isArray(d.messages)) rawMessages = d.messages
      }
    } catch {
      rawMessages = []
    }
  }
  const messages: Scanned[] = []
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const msg = hermesMessage(raw as Record<string, unknown>, messages.length)
    if (msg) messages.push(msg)
  }
  return { ...key, workspace: project, messages }
}

// --- opencode: opencode.db (never written) ------------------------------------

function opencodeMessageText(db: Database, messageId: string): string {
  const parts: string[] = []
  const rows = db
    .query("SELECT data FROM part WHERE message_id = ? ORDER BY time_created")
    .all(messageId) as Array<{ data: string }>
  for (const row of rows) {
    try {
      const data = JSON.parse(row.data)
      if (data && typeof data === "object" && (data.type === "text" || data.type === "reasoning") && typeof data.text === "string" && data.text) {
        parts.push(data.text)
      }
    } catch {
      continue
    }
  }
  return parts.join("\n")
}

function opencodeLoad(db: Database, key: SourceKey): ScannedSession {
  const session = db
    .query("SELECT id, directory FROM session WHERE id = ?")
    .get(key.sourceId) as { id: string; directory: string | null } | null
  const messages: Scanned[] = []
  if (session) {
    const rows = db
      .query("SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created")
      .all(key.sourceId) as Array<{ id: string; data: string; time_created: unknown }>
    for (const row of rows) {
      let role: unknown
      try {
        role = (JSON.parse(row.data) as Record<string, unknown>).role
      } catch {
        continue
      }
      if (role !== "user" && role !== "assistant") continue
      const text = opencodeMessageText(db, row.id).trim()
      if (!text) continue
      messages.push(message(role, text, parseTs(row.time_created), messages.length))
    }
  }
  return { ...key, workspace: session?.directory ?? "", messages }
}

// --- scan orchestration --------------------------------------------------------

function yieldLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function scanFileAgent(
  agent: string,
  keys: SourceKey[],
  load: (key: SourceKey) => ScannedSession,
): Promise<ScanStats> {
  const stats: ScanStats = { agent, scanned: 0, indexed: 0, skipped: 0, newMessages: 0 }
  const fingerprints = readSourceFingerprints(agent)
  let batch: ScannedSession[] = []
  const flush = () => {
    stats.newMessages += indexScannedSessions(agent, batch)
    batch = []
  }
  for (const key of keys) {
    stats.scanned++
    if (fingerprints.get(key.sourceId) === key.fingerprint) {
      stats.skipped++
      continue
    }
    try {
      batch.push(load(key))
      stats.indexed++
    } catch {
      stats.skipped++ // unreadable session file; retried next scan
    }
    if (batch.length >= BATCH_SIZE) {
      flush()
      await yieldLoop()
    }
    if (stats.scanned % YIELD_EVERY === 0) await yieldLoop()
  }
  flush()
  return stats
}

async function scanOpencode(dbPath: string): Promise<ScanStats> {
  const agent = "opencode"
  const stats: ScanStats = { agent, scanned: 0, indexed: 0, skipped: 0, newMessages: 0 }
  if (!existsSync(dbPath)) return stats
  const db = new Database(dbPath, { readonly: true })
  try {
    const sessions = db.query("SELECT id, time_updated FROM session").all() as Array<{
      id: string
      time_updated: unknown
    }>
    const keys: SourceKey[] = sessions.map((row) => ({
      sourceId: row.id,
      sourcePath: `${dbPath}#${row.id}`,
      fingerprint: String(row.time_updated),
    }))
    // Sessions athena's live indexer owns stay under agent "athena"; skipping
    // them here keeps each session indexed under exactly one agent.
    const owned = athenaOwnedSessionIds(keys.map((key) => key.sourceId))
    const fingerprints = readSourceFingerprints(agent)
    let batch: ScannedSession[] = []
    const flush = () => {
      stats.newMessages += indexScannedSessions(agent, batch)
      batch = []
    }
    for (const key of keys) {
      stats.scanned++
      if (owned.has(key.sourceId) || fingerprints.get(key.sourceId) === key.fingerprint) {
        stats.skipped++
        continue
      }
      batch.push(opencodeLoad(db, key))
      stats.indexed++
      if (batch.length >= BATCH_SIZE) {
        flush()
        await yieldLoop()
      }
    }
    flush()
  } finally {
    db.close()
  }
  return stats
}

export async function scanAgentSessions(roots: ScanRoots = defaultScanRoots()): Promise<ScanStats[]> {
  const results: ScanStats[] = []
  const agents: Array<[string, () => Promise<ScanStats>]> = [
    ["claude", () => scanFileAgent("claude", claudeKeys(roots.claude), claudeLoad)],
    ["codex", () => scanFileAgent("codex", codexKeys(roots.codex), codexLoad)],
    ["hermes", () => scanFileAgent("hermes", hermesKeys(roots.hermes), hermesLoad)],
    ["opencode", () => scanOpencode(roots.opencodeDb)],
  ]
  for (const [agent, run] of agents) {
    try {
      results.push(await run())
    } catch (error) {
      results.push({
        agent,
        scanned: 0,
        indexed: 0,
        skipped: 0,
        newMessages: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

let scanRunning = false
let lastScanStarted = 0

// Debounced background entry point for the turn loop: kicks a scan at most
// once per interval per process and never blocks the calling turn.
export function scheduleAgentScan(): void {
  const now = Date.now()
  if (scanRunning || now - lastScanStarted < SCAN_INTERVAL_MS) return
  scanRunning = true
  lastScanStarted = now
  setTimeout(() => {
    scanAgentSessions()
      .then((results) => {
        for (const stats of results) {
          if (stats.error) console.error(`athena-code agent scan (${stats.agent}) failed: ${stats.error}`)
        }
      })
      .catch((error) => console.error("athena-code agent scan failed:", error))
      .finally(() => {
        scanRunning = false
      })
  }, 0)
}
