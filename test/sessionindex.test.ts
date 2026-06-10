import { test, expect } from "bun:test"
import { chmodSync, existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  indexMessages,
  indexSessionMessages,
  readSessionRecall,
  searchSessions,
  sessionRecallEntry,
} from "../overlay/packages/opencode/src/session/memory/sessionindex"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

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
})

test("session recall can read an existing read-only index", () => {
  const ws = workspace("athftsreadonly-")
  indexMessages(ws, corpus)
  const dbPath = join(ws, ".context-workspace", "context", "sessions.db")
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
