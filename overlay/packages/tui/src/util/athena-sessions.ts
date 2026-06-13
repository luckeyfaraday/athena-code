// TUI-side browser over athena-code's cross-agent session index
// (~/.athena-code/context/sessions.db, written by the opencode-side indexer in
// session/memory/sessionindex.ts and the background scanner in agentscan.ts).
// The TUI package does not statically import from packages/opencode, so the
// path, schema guard, and FTS quoting are mirrored here; normal list/search
// operations stay read-only, while /find-sessions can request a throttled
// scanner refresh.

import { Database } from "bun:sqlite"
import { spawn } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const SCHEMA_VERSION = 3
const TITLE_MAX = 120
const FIND_SESSIONS_REFRESH_INTERVAL_MS = 30_000

export interface AthenaSessionEntry {
  agent: string
  sessionId: string
  workspace: string
  // ISO timestamp of the newest timestamped turn; sessions indexed from
  // sources without timestamps (ts like "seq:N" or a message id) have null.
  updated: string | null
  turns: number
  title: string
  // Best-matching turn when the entry came from a search.
  snippet?: string
}

function sessionIndexPath(): string {
  const home = resolve(process.env.ATHENA_CODE_HOME || join(homedir(), ".athena-code"))
  return join(home, "context", "sessions.db")
}

// Readonly open; absent or pre-cross-agent (v1) indexes read as empty rather
// than erroring — the writer migrates them on its next turn.
function open(): Database | null {
  const path = sessionIndexPath()
  if (!existsSync(path)) return null
  try {
    const db = new Database(path, { readonly: true })
    db.run("PRAGMA busy_timeout = 2000")
    const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version
    if (version !== SCHEMA_VERSION) {
      db.close()
      return null
    }
    return db
  } catch {
    return null
  }
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > TITLE_MAX ? flat.slice(0, TITLE_MAX - 1) + "…" : flat
}

function firstUserText(db: Database, agent: string, sessionId: string): string {
  const row = db
    .query(
      `SELECT text FROM messages WHERE agent = ? AND session_id = ?
       ORDER BY (role != 'user'), id ASC LIMIT 1`,
    )
    .get(agent, sessionId) as { text: string } | null
  return oneLine(row?.text ?? "")
}

interface GroupRow {
  agent: string
  sessionId: string
  workspace: string
  updated: string | null
  turns: number
}

const GROUP_SELECT = `
  SELECT agent, session_id AS sessionId, workspace,
         MAX(CASE WHEN ts GLOB '[12][0-9][0-9][0-9]-*' THEN ts END) AS updated,
         COUNT(*) AS turns
  FROM messages`

export function listRecentSessions(limit = 100): AthenaSessionEntry[] {
  const db = open()
  if (!db) return []
  try {
    const rows = db
      .query(
        `${GROUP_SELECT}
         GROUP BY agent, session_id
         ORDER BY (updated IS NULL), COALESCE(updated, '') DESC, MAX(id) DESC
         LIMIT ?`,
      )
      .all(limit) as GroupRow[]
    return rows.map((row) => ({ ...row, title: firstUserText(db, row.agent, row.sessionId) }))
  } finally {
    db.close()
  }
}

export interface ArchiveStats {
  sessions: number
  agents: number
  // Sessions indexed from the given workspace directory (0 when unknown).
  workspaceSessions: number
}

// Headline numbers for the home screen's command room. Null when the index
// is absent or unreadable so the caller can omit the line entirely rather
// than render zeros that look like data.
export function archiveStats(workspace?: string): ArchiveStats | null {
  const db = open()
  if (!db) return null
  try {
    const totals = db
      .query(
        `SELECT COUNT(DISTINCT agent || ':' || session_id) AS sessions,
                COUNT(DISTINCT agent) AS agents
         FROM messages`,
      )
      .get() as { sessions: number; agents: number }
    const workspaceSessions = workspace
      ? (
          db
            .query(`SELECT COUNT(DISTINCT agent || ':' || session_id) AS n FROM messages WHERE workspace = ?`)
            .get(resolve(workspace)) as { n: number }
        ).n
      : 0
    return { sessions: totals.sessions, agents: totals.agents, workspaceSessions }
  } catch {
    return null
  } finally {
    db.close()
  }
}

// Quote each token as an FTS5 literal and OR them, so user punctuation can
// never inject FTS operators or cause a syntax error (mirrors sessionindex.ts).
function matchExpression(query: string): string {
  const tokens = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 1)
  return tokens.map((token) => `"${token}"`).join(" OR ")
}

export function searchSessions(query: string, limit = 50): AthenaSessionEntry[] {
  const match = matchExpression(query)
  if (!match) return []
  const db = open()
  if (!db) return []
  try {
    // bm25() is only valid in a plain FTS query, so score rows in the inner
    // select and group outside it; SQLite's bare-column-with-MIN semantics
    // make `snippet` come from the best-scoring (lowest bm25) turn of each
    // session. The inner LIMIT bounds work on huge indexes.
    const hits = db
      .query(
        `SELECT agent, sessionId, snippet, MIN(score) AS score
         FROM (
           SELECT m.agent AS agent, m.session_id AS sessionId, m.text AS snippet,
                  bm25(messages_fts) AS score
           FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
           WHERE messages_fts MATCH ?
           ORDER BY score ASC
           LIMIT 500
         )
         GROUP BY agent, sessionId
         ORDER BY score ASC, sessionId DESC
         LIMIT ?`,
      )
      .all(match, limit * 3) as Array<{ agent: string; sessionId: string; snippet: string }>
    const group = db.prepare(`${GROUP_SELECT} WHERE agent = ? AND session_id = ? GROUP BY agent, session_id`)
    // One result per distinct snippet: Hermes rolling sessions copy their full
    // history into each new session file, so without this the list shows the
    // same line many times. Score order plus the sessionId DESC tiebreak keeps
    // the newest copy (Hermes filenames embed their timestamp).
    const seen = new Set<string>()
    const out: AthenaSessionEntry[] = []
    for (const hit of hits) {
      if (out.length >= limit) break
      const snippet = oneLine(hit.snippet)
      if (seen.has(snippet)) continue
      seen.add(snippet)
      const row = group.get(hit.agent, hit.sessionId) as GroupRow | null
      if (!row) continue
      out.push({ ...row, title: firstUserText(db, row.agent, row.sessionId), snippet })
    }
    return out
  } finally {
    db.close()
  }
}

// /find-sessions is the strongest signal that freshness matters. Keep normal
// browsing/search read-only, but ask the shared scanner for a throttled refresh
// when the dialog opens and let the caller repaint when it settles.
export async function refreshSessionIndex(minIntervalMs = FIND_SESSIONS_REFRESH_INTERVAL_MS): Promise<boolean> {
  try {
    const { scheduleAgentScan } = await import("../../../opencode/src/session/memory/agentscan")
    const result = await scheduleAgentScan({ minIntervalMs })
    return result !== null
  } catch {
    return false
  }
}

// The fields resume needs; satisfied by AthenaSessionEntry and by the
// athena.agent.takeover event payload.
export type ResumableSession = Pick<AthenaSessionEntry, "agent" | "sessionId" | "workspace">

// The native resume invocation per agent, run from the session's workspace
// when it still exists (mirrors the legacy Athena TUI's resume commands).
// Athena's own sessions resume through this very binary; sessions still known
// to the running server are instead navigated to in-app by the dialog.
export function resumeCommand(entry: ResumableSession): { argv: string[]; cwd: string } | null {
  const workspace = entry.workspace && isDirectory(entry.workspace) ? entry.workspace : process.cwd()
  switch (entry.agent) {
    case "athena":
      return { argv: [process.execPath, workspace, "--session", entry.sessionId], cwd: workspace }
    case "opencode":
      return { argv: ["opencode", workspace, "--session", entry.sessionId], cwd: workspace }
    case "claude":
      return { argv: ["claude", "--resume", entry.sessionId], cwd: workspace }
    case "codex":
      return { argv: ["codex", "resume", "--cd", workspace, entry.sessionId], cwd: workspace }
    case "hermes":
      return { argv: ["hermes", "--resume", entry.sessionId], cwd: workspace }
    default:
      return null
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Minimal surfaces of @opentui's renderer and the TUI toast, so this util
// stays free of component imports.
export type ResumeRenderer = {
  suspend(): void
  resume(): void
  requestRender(): void
  currentRenderBuffer: { clear(): void }
}

export type ResumeToast = {
  show(toast: { variant: "error"; title?: string; message: string }): void
}

// Suspend the TUI and exec the agent's native resume command in this
// terminal; the TUI repaints when the agent exits. Shared by the
// /find-sessions dialog and the agent_takeover event listener.
export function execResume(entry: ResumableSession, renderer: ResumeRenderer, toast: ResumeToast): boolean {
  const command = resumeCommand(entry)
  if (!command) {
    toast.show({ variant: "error", message: `No resume command known for ${entry.agent} sessions` })
    return false
  }
  renderer.suspend()
  renderer.currentRenderBuffer.clear()
  const restore = () => {
    renderer.currentRenderBuffer.clear()
    renderer.resume()
    renderer.requestRender()
  }
  const child = spawn(command.argv[0]!, command.argv.slice(1), {
    cwd: command.cwd,
    stdio: ["inherit", "inherit", "inherit"],
    shell: process.platform === "win32",
  })
  child.on("error", (error) => {
    restore()
    toast.show({
      variant: "error",
      title: `Failed to launch ${entry.agent}`,
      message: error instanceof Error ? error.message : String(error),
    })
  })
  child.on("exit", restore)
  return true
}
