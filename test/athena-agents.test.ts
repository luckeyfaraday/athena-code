import { beforeEach, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  agentCommand,
  clearAthenaAgentsForTest,
  parseAgentKind,
  parseSpawnFilter,
} from "../overlay/packages/tui/src/util/athena-agents"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

beforeEach(() => {
  clearAthenaAgentsForTest()
})

test("agentCommand builds native standalone launch commands", () => {
  const ws = workspace("athagent-")
  expect(agentCommand({ kind: "claude", workspace: ws, task: "review auth" })).toEqual({
    argv: ["claude", "review auth"],
    cwd: ws,
  })
  expect(agentCommand({ kind: "codex", workspace: ws, task: "fix parser" })).toEqual({
    argv: ["codex", "exec", "--cd", ws, "fix parser"],
    cwd: ws,
  })
  expect(agentCommand({ kind: "opencode", workspace: ws, task: "run tests" })).toEqual({
    argv: ["opencode", "run", "--dir", ws, "run tests"],
    cwd: ws,
  })
  expect(agentCommand({ kind: "hermes", workspace: ws, task: "summarize" })).toEqual({
    argv: ["hermes", "summarize"],
    cwd: ws,
  })
})

test("agentCommand falls back to current directory for missing workspaces", () => {
  const missing = join(tmpdir(), "athagent-missing-workspace")
  expect(agentCommand({ kind: "codex", workspace: missing, task: "inspect" }).cwd).toBe(process.cwd())
})

test("parse helpers accept known agent kinds and task filters", () => {
  expect(parseAgentKind("Claude")).toBe("claude")
  expect(parseAgentKind("unknown")).toBeNull()
  expect(parseSpawnFilter("codex fix checkout")).toEqual({ kind: "codex", task: "fix checkout" })
  expect(parseSpawnFilter("fix checkout")).toEqual({ kind: null, task: "fix checkout" })
})
