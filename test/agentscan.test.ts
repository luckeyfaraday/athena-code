import { beforeEach, test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  defaultScanRoots,
  scanAgentSessions,
  type ScanRoots,
} from "../overlay/packages/opencode/src/session/memory/agentscan"
import {
  indexMessages,
  searchSessions,
  sessionIndexPath,
} from "../overlay/packages/opencode/src/session/memory/sessionindex"

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

beforeEach(() => {
  process.env.ATHENA_CODE_HOME = tmp("athhome-agentscan-")
})

const jsonl = (objects: unknown[]) => objects.map((o) => JSON.stringify(o)).join("\n") + "\n"

// One session per agent, each with a unique keyword so search results are
// attributable: claude→quasar, codex→pulsar, hermes→magnetar, opencode→blazar.

function writeClaudeFixture(root: string): string {
  const dir = join(root, "-home-x-proj")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, "11111111-aaaa-bbbb-cccc-000000000001.jsonl")
  writeFileSync(
    file,
    jsonl([
      { type: "summary", summary: "not a message" },
      {
        type: "user",
        cwd: "/home/x/proj",
        timestamp: "2026-06-01T10:00:00Z",
        message: { role: "user", content: "how should we shard the quasar ingestion queue" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-01T10:00:05Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "sharding by tenant keeps the quasar queue balanced" },
            { type: "text", text: "shard the quasar queue by tenant id" },
            { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
    ]),
  )
  return file
}

function writeCodexFixture(root: string): void {
  const dir = join(root, "2026", "06", "01")
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "rollout-2026-06-01T11-00-00-abc.jsonl"),
    jsonl([
      { timestamp: "2026-06-01T11:00:00Z", type: "session_meta", payload: { id: "codex-sess-1", cwd: "/home/x/codexproj" } },
      {
        timestamp: "2026-06-01T11:00:01Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "trace the pulsar timeout in the worker pool" }] },
      },
      {
        timestamp: "2026-06-01T11:00:02Z",
        type: "event_msg",
        payload: { type: "user_message", message: "trace the pulsar timeout in the worker pool" },
      },
      {
        timestamp: "2026-06-01T11:00:09Z",
        type: "response_item",
        payload: { type: "reasoning", summary: [], content: [] },
      },
      {
        timestamp: "2026-06-01T11:00:10Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "the pulsar timeout came from a saturated worker pool" }] },
      },
    ]),
  )
}

function writeHermesFixture(root: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(
    join(root, "hermes-aaa.json"),
    JSON.stringify({
      session_id: "hermes-aaa",
      platform: "discord",
      messages: [
        { role: "user", content: "summarize the magnetar deployment thread", timestamp: "2026-06-02T08:00:00Z" },
        {
          role: "assistant",
          content: [{ text: "the magnetar deployment finished after the rollback" }],
          reasoning: "the thread mentions a rollback before the magnetar deploy",
          timestamp: "2026-06-02T08:00:04Z",
        },
        { role: "tool", content: "ignored tool output", timestamp: "2026-06-02T08:00:05Z" },
      ],
    }),
  )
  writeFileSync(
    join(root, "hermes-bbb.jsonl"),
    jsonl([
      { role: "user", content: "remind me about the ceres alert budget", timestamp: "2026-06-02T09:00:00Z" },
      { role: "assistant", content: "the ceres alert budget is three pages per week", timestamp: "2026-06-02T09:00:02Z" },
    ]),
  )
}

function writeOpencodeFixture(dbPath: string, sessions: Array<{ id: string; keyword: string }>): void {
  const db = new Database(dbPath)
  db.run("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER)")
  db.run("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT, time_created INTEGER)")
  db.run("CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, data TEXT, time_created INTEGER)")
  let t = 1750000000000
  for (const session of sessions) {
    db.run("INSERT INTO session VALUES (?, ?, ?, ?, ?)", [session.id, `about ${session.keyword}`, "/home/x/ocproj", t, t + 60_000])
    const userMsg = `${session.id}-m1`
    const assistantMsg = `${session.id}-m2`
    db.run("INSERT INTO message VALUES (?, ?, ?, ?)", [userMsg, session.id, JSON.stringify({ role: "user" }), t + 1000])
    db.run("INSERT INTO message VALUES (?, ?, ?, ?)", [assistantMsg, session.id, JSON.stringify({ role: "assistant" }), t + 2000])
    db.run("INSERT INTO part VALUES (?, ?, ?, ?)", [`${userMsg}-p1`, userMsg, JSON.stringify({ type: "text", text: `how do we cache the ${session.keyword} results` }), t + 1000])
    db.run("INSERT INTO part VALUES (?, ?, ?, ?)", [`${assistantMsg}-p1`, assistantMsg, JSON.stringify({ type: "reasoning", text: `caching ${session.keyword} needs a ttl` }), t + 2000])
    db.run("INSERT INTO part VALUES (?, ?, ?, ?)", [`${assistantMsg}-p2`, assistantMsg, JSON.stringify({ type: "text", text: `cache the ${session.keyword} results for one hour` }), t + 2001])
    db.run("INSERT INTO part VALUES (?, ?, ?, ?)", [`${assistantMsg}-p3`, assistantMsg, JSON.stringify({ type: "step-start" }), t + 2002])
    t += 120_000
  }
  db.close()
}

function fixtureRoots(): { roots: ScanRoots; claudeFile: string } {
  const base = tmp("athscan-fixtures-")
  const roots: ScanRoots = {
    claude: join(base, "claude-projects"),
    codex: join(base, "codex-sessions"),
    hermes: join(base, "hermes-sessions"),
    opencodeDb: join(base, "opencode.db"),
  }
  const claudeFile = writeClaudeFixture(roots.claude)
  writeCodexFixture(roots.codex)
  writeHermesFixture(roots.hermes)
  writeOpencodeFixture(roots.opencodeDb, [{ id: "ses_oc1", keyword: "blazar" }])
  return { roots, claudeFile }
}

function statsByAgent(stats: Awaited<ReturnType<typeof scanAgentSessions>>): Record<string, (typeof stats)[number]> {
  return Object.fromEntries(stats.map((s) => [s.agent, s]))
}

test("scan indexes all four agents and search attributes hits to them", async () => {
  const { roots } = fixtureRoots()
  const stats = statsByAgent(await scanAgentSessions(roots))

  expect(stats.claude).toMatchObject({ scanned: 1, indexed: 1, newMessages: 2 })
  expect(stats.codex).toMatchObject({ scanned: 1, indexed: 1, newMessages: 2 })
  expect(stats.hermes).toMatchObject({ scanned: 2, indexed: 2, newMessages: 4 })
  expect(stats.opencode).toMatchObject({ scanned: 1, indexed: 1, newMessages: 2 })
  expect(Object.values(stats).every((s) => !s.error)).toBe(true)

  const ws = tmp("athscan-ws-")
  const cases: Array<[string, string, string]> = [
    ["quasar ingestion", "claude", "/home/x/proj"],
    ["pulsar timeout", "codex", "/home/x/codexproj"],
    ["magnetar deployment", "hermes", "discord"],
    ["blazar cache", "opencode", "/home/x/ocproj"],
  ]
  for (const [query, agent, workspace] of cases) {
    const hits = searchSessions(ws, query)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.agent === agent)).toBe(true)
    expect(hits.every((hit) => hit.workspace === workspace)).toBe(true)
  }

  // Codex message rows carry the real session id from session_meta, and the
  // claude assistant turn keeps thinking but drops the tool_use block.
  expect(searchSessions(ws, "pulsar timeout")[0].session_id).toBe("codex-sess-1")
  const claudeHits = searchSessions(ws, "quasar tenant")
  expect(claudeHits.some((hit) => hit.text.includes("sharding by tenant"))).toBe(true)
  expect(claudeHits.every((hit) => !hit.text.includes("tool_use"))).toBe(true)
})

test("missing roots are guarded: nothing indexed, nothing thrown", async () => {
  const base = tmp("athscan-missing-")
  const stats = await scanAgentSessions({
    claude: join(base, "nope-claude"),
    codex: join(base, "nope-codex"),
    hermes: join(base, "nope-hermes"),
    opencodeDb: join(base, "nope.db"),
  })
  expect(stats.every((s) => s.scanned === 0 && s.indexed === 0 && !s.error)).toBe(true)
})

test("rescan skips unchanged sessions and picks up appended turns", async () => {
  const { roots, claudeFile } = fixtureRoots()
  await scanAgentSessions(roots)

  const second = statsByAgent(await scanAgentSessions(roots))
  for (const agent of ["claude", "codex", "hermes", "opencode"]) {
    expect(second[agent].indexed).toBe(0)
    expect(second[agent].newMessages).toBe(0)
    expect(second[agent].skipped).toBe(second[agent].scanned)
  }

  appendFileSync(
    claudeFile,
    JSON.stringify({
      type: "user",
      timestamp: "2026-06-01T10:05:00Z",
      message: { role: "user", content: "also document the quasar shard layout" },
    }) + "\n",
  )
  const third = statsByAgent(await scanAgentSessions(roots))
  expect(third.claude).toMatchObject({ indexed: 1, newMessages: 1 })
  expect(third.codex.indexed).toBe(0)

  const ws = tmp("athscan-ws2-")
  expect(searchSessions(ws, "quasar shard layout").some((hit) => hit.text.includes("document the quasar"))).toBe(true)
})

test("opencode sessions owned by athena's live indexer are not double-indexed", async () => {
  const { roots } = fixtureRoots()
  writeOpencodeFixture(join(tmp("athscan-oc2-"), "unused.db"), []) // keep fixture helper exercised for empty case
  const ws = tmp("athscan-live-ws-")
  // Athena live-indexes a session that also exists in the opencode store.
  const liveRoots = { ...roots, opencodeDb: join(tmp("athscan-oc3-"), "opencode.db") }
  writeOpencodeFixture(liveRoots.opencodeDb, [
    { id: "ses_live", keyword: "blazar" },
    { id: "ses_other", keyword: "parsec" },
  ])
  indexMessages(ws, [
    { sessionId: "ses_live", role: "user", ts: "msg_1", text: "how do we cache the blazar results" },
  ])

  const stats = statsByAgent(await scanAgentSessions(liveRoots))
  expect(stats.opencode).toMatchObject({ scanned: 2, indexed: 1, skipped: 1 })

  const blazar = searchSessions(ws, "blazar")
  expect(blazar.length).toBeGreaterThan(0)
  expect(blazar.every((hit) => hit.agent === "athena")).toBe(true)
  const parsec = searchSessions(ws, "parsec")
  expect(parsec.every((hit) => hit.agent === "opencode" && hit.session_id === "ses_other")).toBe(true)
})

test("defaultScanRoots honors env overrides", () => {
  process.env.ATHENA_SCAN_CLAUDE_DIR = "/custom/claude"
  process.env.ATHENA_SCAN_OPENCODE_DB = "/custom/opencode.db"
  try {
    const roots = defaultScanRoots()
    expect(roots.claude).toBe("/custom/claude")
    expect(roots.opencodeDb).toBe("/custom/opencode.db")
    expect(roots.codex.endsWith(join(".codex", "sessions"))).toBe(true)
  } finally {
    delete process.env.ATHENA_SCAN_CLAUDE_DIR
    delete process.env.ATHENA_SCAN_OPENCODE_DB
  }
})

// --- oracle parity with Sessions-search --------------------------------------
//
// The TS adapters are a port of the Python ones in the Sessions-search project;
// when its CLI is installed, point both at the same fixtures and require
// identical per-agent session and message extraction counts.

const oracleAvailable = spawnSync("sessions-search", ["--help"], { encoding: "utf8" }).status === 0

test.skipIf(!oracleAvailable)("extraction counts match the sessions-search oracle", async () => {
  const { roots } = fixtureRoots()
  await scanAgentSessions(roots)

  const ours: Record<string, { sessions: number; messages: number }> = {}
  const db = new Database(sessionIndexPath(), { readonly: true })
  try {
    for (const agent of ["claude", "codex", "hermes", "opencode"]) {
      const row = db
        .query("SELECT COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS messages FROM messages WHERE agent = ?")
        .get(agent) as { sessions: number; messages: number }
      ours[agent] = { sessions: row.sessions, messages: row.messages }
    }
  } finally {
    db.close()
  }

  const env = {
    ...process.env,
    SESSIONS_SEARCH_DATA_DIR: tmp("athscan-oracle-"),
    SESSIONS_SEARCH_CLAUDE_DIR: roots.claude,
    SESSIONS_SEARCH_CODEX_DIR: roots.codex,
    SESSIONS_SEARCH_HERMES_DIR: roots.hermes,
    SESSIONS_SEARCH_OPENCODE_DB: roots.opencodeDb,
  }
  expect(spawnSync("sessions-search", ["reindex"], { env, encoding: "utf8" }).status).toBe(0)
  const stats = spawnSync("sessions-search", ["stats"], { env, encoding: "utf8" })
  expect(stats.status).toBe(0)

  const oracle: Record<string, { sessions: number; messages: number }> = {}
  for (const line of stats.stdout.split("\n")) {
    const match = line.match(/^\s*(claude|codex|opencode|hermes)\s+(\d+) sessions\s+(\d+) messages/)
    if (match) oracle[match[1]] = { sessions: Number(match[2]), messages: Number(match[3]) }
  }
  expect(oracle).toEqual(ours)
})
