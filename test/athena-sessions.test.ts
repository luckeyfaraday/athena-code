// Tests for the TUI-side read-only session browser (util/athena-sessions.ts),
// fed through the opencode-side writers so the two halves are exercised
// against the same database.

import { beforeEach, test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  indexMessages,
  indexScannedSessions,
} from "../overlay/packages/opencode/src/session/memory/sessionindex"
import {
  archiveStats,
  listRecentSessions,
  resumeCommand,
  searchSessions,
} from "../overlay/packages/tui/src/util/athena-sessions"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

beforeEach(() => {
  process.env.ATHENA_CODE_HOME = workspace("athhome-tui-")
})

function seed(ws: string) {
  indexMessages(ws, [
    { sessionId: "ath1", role: "user", ts: "2026-06-03T10:00:00Z", text: "wire up the splash screen animation" },
    { sessionId: "ath1", role: "assistant", ts: "2026-06-03T10:00:05Z", text: "the splash blooms the six-spoke mark" },
  ])
  indexScannedSessions("claude", [
    {
      sourceId: "cl1",
      sourcePath: "/fake/cl1.jsonl",
      fingerprint: "f1",
      workspace: ws,
      messages: [
        { role: "user", ts: "2026-06-05T08:00:00Z", text: "debug the manifold timeout in the worker pool" },
        { role: "assistant", ts: "2026-06-05T08:00:09Z", text: "the timeout came from the retry budget" },
      ],
    },
  ])
  indexScannedSessions("codex", [
    {
      sourceId: "cx1",
      sourcePath: "/fake/cx1.jsonl",
      fingerprint: "f2",
      workspace: "/elsewhere/project",
      messages: [{ role: "user", ts: "seq:0", text: "refactor the installer smoke tests" }],
    },
  ])
}

test("absent index lists as empty", () => {
  expect(listRecentSessions()).toEqual([])
  expect(searchSessions("anything")).toEqual([])
  expect(archiveStats()).toBeNull()
})

test("archive stats count distinct sessions, agents, and workspace sessions", () => {
  const ws = workspace("athtui-")
  seed(ws)
  expect(archiveStats(ws)).toEqual({ sessions: 3, agents: 3, workspaceSessions: 2 })
  // Unknown workspace still reports global counts.
  expect(archiveStats("/nowhere/at/all")).toMatchObject({ sessions: 3, agents: 3, workspaceSessions: 0 })
  expect(archiveStats()).toMatchObject({ workspaceSessions: 0 })
})

test("lists one entry per session, newest timestamped first", () => {
  const ws = workspace("athtui-")
  seed(ws)
  const entries = listRecentSessions()
  expect(entries.length).toBe(3)
  expect(entries[0]).toMatchObject({ agent: "claude", sessionId: "cl1", workspace: ws, turns: 2 })
  expect(entries[0].updated).toBe("2026-06-05T08:00:09Z")
  expect(entries[0].title).toContain("manifold timeout")
  expect(entries[1]).toMatchObject({ agent: "athena", sessionId: "ath1" })
  // The codex session has no parseable timestamps, so it sorts last with null updated.
  expect(entries[2]).toMatchObject({ agent: "codex", sessionId: "cx1", updated: null })
})

test("search groups hits per session and carries a snippet", () => {
  const ws = workspace("athtui-")
  seed(ws)
  const hits = searchSessions("where did we debug the manifold timeout?")
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]).toMatchObject({ agent: "claude", sessionId: "cl1" })
  expect(hits[0].snippet?.toLowerCase()).toContain("timeout")
  expect(hits.filter((h) => h.agent === "claude" && h.sessionId === "cl1").length).toBe(1)
})

test("search with only stop-word-ish punctuation is empty, not an error", () => {
  const ws = workspace("athtui-")
  seed(ws)
  expect(searchSessions('"*()" -')).toEqual([])
})

test("resume commands follow each agent's native CLI", () => {
  const ws = workspace("athtui-")
  const base = { workspace: ws, updated: null, turns: 1, title: "t" }
  expect(resumeCommand({ ...base, agent: "claude", sessionId: "c1" })).toEqual({
    argv: ["claude", "--resume", "c1"],
    cwd: ws,
  })
  expect(resumeCommand({ ...base, agent: "codex", sessionId: "x1" })).toEqual({
    argv: ["codex", "resume", "--cd", ws, "x1"],
    cwd: ws,
  })
  expect(resumeCommand({ ...base, agent: "opencode", sessionId: "o1" })).toEqual({
    argv: ["opencode", ws, "--session", "o1"],
    cwd: ws,
  })
  expect(resumeCommand({ ...base, agent: "hermes", sessionId: "h1" })).toEqual({
    argv: ["hermes", "--resume", "h1"],
    cwd: ws,
  })
  const athena = resumeCommand({ ...base, agent: "athena", sessionId: "a1" })
  expect(athena?.argv.slice(1)).toEqual([ws, "--session", "a1"])
  expect(resumeCommand({ ...base, agent: "mystery", sessionId: "m1" })).toBeNull()
})

test("a vanished workspace falls back to the current directory", () => {
  const gone = join(tmpdir(), "athtui-definitely-missing-dir")
  const cmd = resumeCommand({ agent: "claude", sessionId: "c1", workspace: gone, updated: null, turns: 1, title: "t" })
  expect(cmd?.cwd).toBe(process.cwd())
  expect(cmd?.argv).toEqual(["claude", "--resume", "c1"])
})

test("search collapses identical snippets from rolling sessions to the newest", () => {
  const ws = workspace("athtui-")
  seed(ws)
  for (const id of ["session_20260516_125409_aa.json", "session_20260516_131400_bb.json"]) {
    indexScannedSessions("hermes", [
      {
        sourceId: id,
        sourcePath: `/fake/${id}`,
        fingerprint: "f3",
        workspace: "telegram",
        messages: [{ role: "user", ts: "seq:0", text: "tune the gravimeter sampling cadence" }],
      },
    ])
  }
  const hits = searchSessions("gravimeter sampling cadence")
  expect(hits.length).toBe(1)
  expect(hits[0].sessionId).toBe("session_20260516_131400_bb.json")
})
