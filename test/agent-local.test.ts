import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnLocalAgentCommand, waitLocalAgent } from "../overlay/packages/opencode/src/session/agent/local"

function workspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

test("local agent wait returns captured stdout and stderr", async () => {
  const record = spawnLocalAgentCommand({
    agent: "codex",
    task: "test task",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "process.stdout.write('pong'); process.stderr.write('warn')"],
  })

  const done = await waitLocalAgent(record.handle, 5000)

  expect(done?.exitedAt).toBeDefined()
  expect(done?.exitCode).toBe(0)
  expect(done?.stdout).toBe("pong")
  expect(done?.stderr).toBe("warn")
})
