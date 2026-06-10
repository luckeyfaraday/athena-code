import { beforeEach, test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  athenaOwnedSessionIds,
  indexMessages,
  indexScannedSessions,
  indexSessionMessages,
  readSessionRecall,
  readSourceFingerprints,
  searchSessions,
  sessionRecallEntry,
  sessionIndexPath,
} from "../overlay/packages/opencode/src/session/memory/sessionindex"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

beforeEach(() => {
  process.env.ATHENA_CODE_HOME = workspace("athhome-session-")
})

const corpus = [
  { sessionId: "s1", role: "user", ts: "2026-06-01T10:00:00Z", text: "how do we roll back a bad deploy on the staging cluster" },
  { sessionId: "s1", role: "assistant", ts: "2026-06-01T10:00:05Z", text: "run kubectl rollout undo against the staging deployment" },
  { sessionId: "s2", role: "user", ts: "2026-06-02T09:00:00Z", text: "what time is standup" },
  { sessionId: "s2", role: "assistant", ts: "2026-06-02T09:00:03Z", text: "standup is at 10am every weekday" },
]

test("index then search returns the relevant session message", () => {
  const ws = workspace("athfts-")
  expect(indexMessages(ws, corpus)).toBe(4)
  const hits = searchSessions(ws, "how do I roll back a staging deploy")
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.some((h) => h.text.toLowerCase().includes("rollout undo"))).toBe(true)
  expect(hits.every((h) => !h.text.includes("standup"))).toBe(true)
})

test("indexing is idempotent per (session, role, ts, text)", () => {
  const ws = workspace("athftsidem-")
  expect(indexMessages(ws, corpus)).toBe(4)
  expect(indexMessages(ws, corpus)).toBe(0) // re-scan inserts nothing
  expect(searchSessions(ws, "rollback deploy").length).toBeGreaterThan(0)
})

test("search resolves the correct session id across sessions", () => {
  const ws = workspace("athftsx-")
  indexMessages(ws, corpus)
  const hits = searchSessions(ws, "when is standup")
  expect(hits[0].session_id).toBe("s2")
})

test("search spans sessions indexed from different workspaces", () => {
  const first = workspace("athftsglobal-a-")
  const second = workspace("athftsglobal-b-")
  indexMessages(first, [corpus[0], corpus[1]])
  indexMessages(second, [corpus[2], corpus[3]])

  const deploy = searchSessions(second, "rollback deploy")
  expect(deploy.some((hit) => hit.workspace === first)).toBe(true)
  const standup = searchSessions(first, "standup")
  expect(standup.some((hit) => hit.workspace === second)).toBe(true)
})

test("empty / stopword-only query returns nothing", () => {
  const ws = workspace("athftsempty-")
  indexMessages(ws, corpus)
  expect(searchSessions(ws, "")).toEqual([])
  expect(searchSessions(ws, "the and for")).toEqual([])
})

test("sessionRecallEntry fences hits and is empty on no match", () => {
  const ws = workspace("athftsfence-")
  indexMessages(ws, corpus)
  const entry = sessionRecallEntry(ws, "rollback the staging deploy")
  expect(entry).toContain("<athena-session-recall")
  expect(entry).toContain("rollout undo")
  expect(sessionRecallEntry(ws, "completely unrelated marine biology")).toBe("")
})

test("indexSessionMessages ingests opencode-shaped text turns", () => {
  const ws = workspace("athftsmsgs-")
  const inserted = indexSessionMessages(ws, "sess-live", [
    {
      info: { id: "msg-user-1", role: "user" },
      parts: [{ type: "text", text: "we decided the mobile smoke test should run before release" }],
    },
    {
      info: { id: "msg-assistant-1", role: "assistant" },
      parts: [
        { type: "text", text: "I added the mobile smoke test to the release checklist" },
        { type: "text", text: "synthetic reminder", synthetic: true },
      ],
    },
  ])

  expect(inserted).toBe(2)
  expect(indexSessionMessages(ws, "sess-live", [
    {
      info: { id: "msg-user-1", role: "user" },
      parts: [{ type: "text", text: "we decided the mobile smoke test should run before release" }],
    },
  ])).toBe(0)
  const hits = searchSessions(ws, "mobile smoke release")
  expect(hits.map((hit) => hit.session_id)).toContain("sess-live")
  expect(hits.some((hit) => hit.text.includes("synthetic reminder"))).toBe(false)
})

test("readSessionRecall reports empty index and no-match states", () => {
  const ws = workspace("athftsread-")
  const empty = readSessionRecall(ws, "deploy")
  expect(empty.empty_index).toBe(true)
  expect(empty.hits).toEqual([])

  indexMessages(ws, corpus)
  const missing = readSessionRecall(ws, "marine biology")
  expect(missing.empty_index).toBe(false)
  expect(missing.hits).toEqual([])

  const found = readSessionRecall(ws, "standup")
  expect(found.empty_index).toBe(false)
  expect(found.hits.length).toBeGreaterThan(0)
  expect(found.hits[0].session_id).toBe("s2")
})

test("searching an uninitialized workspace does not create a session index", () => {
  const ws = workspace("athftsreadonly-empty-")
  expect(readSessionRecall(ws, "deploy").empty_index).toBe(true)
  expect(existsSync(join(ws, ".context-workspace"))).toBe(false)
  expect(existsSync(sessionIndexPath())).toBe(false)
})

test("session recall can read an existing read-only index", () => {
  const ws = workspace("athftsreadonly-")
  indexMessages(ws, corpus)
  const dbPath = sessionIndexPath()
  chmodSync(dbPath, 0o444)
  try {
    const result = readSessionRecall(ws, "standup")
    expect(result.hits.some((hit) => hit.session_id === "s2")).toBe(true)
  } finally {
    chmodSync(dbPath, 0o644)
  }
})

test("last session returns the most recently indexed session", () => {
  const ws = workspace("athftslatest-")
  indexMessages(ws, corpus)
  const result = readSessionRecall(ws, "last session")
  expect(result.hits.length).toBeGreaterThan(0)
  expect(result.hits.every((hit) => hit.session_id === "s2")).toBe(true)
  expect(result.hits.some((hit) => hit.text.includes("standup"))).toBe(true)
})

test("recall excludes the active session", () => {
  const ws = workspace("athftsexclude-")
  indexMessages(ws, corpus)

  const latest = readSessionRecall(ws, "last session", 5, "s2")
  expect(latest.hits.length).toBeGreaterThan(0)
  expect(latest.hits.every((hit) => hit.session_id === "s1")).toBe(true)

  const search = readSessionRecall(ws, "standup", 5, "s2")
  expect(search.hits).toEqual([])
})

test("live-indexed hits carry the athena agent tag", () => {
  const ws = workspace("athftsagent-")
  indexMessages(ws, corpus)
  const hits = searchSessions(ws, "standup")
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every((hit) => hit.agent === "athena")).toBe(true)
})

test("scanned sessions index under their agent and filter by agent", () => {
  const ws = workspace("athftsscan-")
  indexMessages(ws, corpus)
  const inserted = indexScannedSessions("claude", [
    {
      sourceId: "claude-uuid-1",
      sourcePath: "/fixtures/claude/claude-uuid-1.jsonl",
      fingerprint: "1:100",
      workspace: "/home/x/proj",
      messages: [
        { role: "user", ts: "2026-06-03T08:00:00Z", text: "tighten the manifold rate limiter threshold" },
        { role: "assistant", ts: "2026-06-03T08:00:05Z", text: "set the manifold limiter to 50 rps" },
      ],
    },
  ])
  expect(inserted).toBe(2)

  const all = searchSessions(ws, "manifold limiter")
  expect(all.some((hit) => hit.agent === "claude")).toBe(true)
  const athenaOnly = searchSessions(ws, "manifold limiter", 5, undefined, "athena")
  expect(athenaOnly).toEqual([])
  const claudeOnly = searchSessions(ws, "manifold limiter", 5, undefined, "claude")
  expect(claudeOnly.length).toBe(2)
  expect(claudeOnly.every((hit) => hit.session_id === "claude-uuid-1")).toBe(true)

  expect(readSourceFingerprints("claude").get("claude-uuid-1")).toBe("1:100")
  // Rescanning the same content adds nothing but refreshes the fingerprint.
  expect(
    indexScannedSessions("claude", [
      {
        sourceId: "claude-uuid-1",
        sourcePath: "/fixtures/claude/claude-uuid-1.jsonl",
        fingerprint: "2:120",
        workspace: "/home/x/proj",
        messages: [{ role: "user", ts: "2026-06-03T08:00:00Z", text: "tighten the manifold rate limiter threshold" }],
      },
    ]),
  ).toBe(0)
  expect(readSourceFingerprints("claude").get("claude-uuid-1")).toBe("2:120")
})

test("live indexing reclaims a session previously scanned from the opencode store", () => {
  const ws = workspace("athftsreclaim-")
  indexScannedSessions("opencode", [
    {
      sourceId: "ses_shared",
      sourcePath: "/fixtures/opencode.db#ses_shared",
      fingerprint: "1700000000",
      workspace: ws,
      messages: [{ role: "user", ts: "2026-06-04T09:00:00Z", text: "wire the telemetry exporter into the gateway" }],
    },
  ])
  expect(athenaOwnedSessionIds(["ses_shared"]).size).toBe(0)

  indexMessages(ws, [
    { sessionId: "ses_shared", role: "user", ts: "msg_1", text: "wire the telemetry exporter into the gateway" },
  ])
  const hits = searchSessions(ws, "telemetry exporter gateway")
  expect(hits.length).toBe(1)
  expect(hits[0].agent).toBe("athena")
  expect(athenaOwnedSessionIds(["ses_shared", "ses_other"])).toEqual(new Set(["ses_shared"]))
})

function createV1Index(): string {
  const path = sessionIndexPath()
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       session_id TEXT NOT NULL,
       workspace TEXT NOT NULL,
       role TEXT NOT NULL,
       ts TEXT NOT NULL,
       text TEXT NOT NULL,
       UNIQUE(session_id, role, ts, text)
     )`,
  )
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(text, content='messages', content_rowid='id')")
  db.run(
    `CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
       INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
     END`,
  )
  db.run("INSERT INTO messages (session_id, workspace, role, ts, text) VALUES ('v1', '/old', 'user', 't1', 'legacy pre-agent row')")
  db.close()
  return path
}

test("a v1 index is rebuilt on the next write", () => {
  const ws = workspace("athftsmigrate-")
  const path = createV1Index()
  expect(indexMessages(ws, corpus)).toBe(4)
  const db = new Database(path, { readonly: true })
  try {
    const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version
    expect(version).toBe(2)
  } finally {
    db.close()
  }
  // The legacy row is dropped by the rebuild; the index is derived data.
  expect(searchSessions(ws, "legacy pre-agent row")).toEqual([])
  expect(searchSessions(ws, "standup").length).toBeGreaterThan(0)
})

test("reading a v1 index reports empty instead of failing", () => {
  const ws = workspace("athftsv1read-")
  createV1Index()
  const result = readSessionRecall(ws, "legacy")
  expect(result.empty_index).toBe(true)
  expect(result.hits).toEqual([])
})

test("last session returns bounded beginning and ending context", () => {
  const ws = workspace("athftsbookends-")
  indexMessages(
    ws,
    Array.from({ length: 8 }, (_, index) => ({
      sessionId: "long-session",
      role: index % 2 === 0 ? "user" : "assistant",
      ts: `msg-${index}`,
      text: `turn ${index}`,
    })),
  )

  const result = readSessionRecall(ws, "last session")
  expect(result.hits.map((hit) => hit.text)).toEqual([
    "turn 0",
    "turn 1",
    "turn 5",
    "turn 6",
    "turn 7",
  ])
})
