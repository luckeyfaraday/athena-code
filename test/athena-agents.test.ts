import { beforeEach, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  clearLocalAgentsForTest,
  localAgentCommand,
  parseLocalAgentKind,
} from "../overlay/packages/opencode/src/session/agents/local"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

beforeEach(() => {
  clearLocalAgentsForTest()
})

test("localAgentCommand builds native standalone launch commands", () => {
  const ws = workspace("athagent-")
  expect(localAgentCommand({ kind: "claude", workspace: ws, task: "review auth" })).toEqual({
    argv: ["claude", "review auth"],
    cwd: ws,
  })
  expect(localAgentCommand({ kind: "codex", workspace: ws, task: "fix parser" })).toEqual({
    argv: ["codex", "exec", "--cd", ws, "fix parser"],
    cwd: ws,
  })
  expect(localAgentCommand({ kind: "opencode", workspace: ws, task: "run tests" })).toEqual({
    argv: ["opencode", "run", "--dir", ws, "run tests"],
    cwd: ws,
  })
  expect(localAgentCommand({ kind: "hermes", workspace: ws, task: "summarize" })).toEqual({
    argv: ["hermes", "summarize"],
    cwd: ws,
  })
})

test("localAgentCommand falls back to current directory for missing workspaces", () => {
  const missing = join(tmpdir(), "athagent-missing-workspace")
  expect(localAgentCommand({ kind: "codex", workspace: missing, task: "inspect" }).cwd).toBe(process.cwd())
})

test("parse helper accepts known agent kinds", () => {
  expect(parseLocalAgentKind("Claude")).toBe("claude")
  expect(parseLocalAgentKind("unknown")).toBeNull()
})
