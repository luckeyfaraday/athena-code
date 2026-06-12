import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  localAgentCommand,
  messageLocalAgent,
  readLocalAgentOutput,
  spawnLocalAgentCommand,
  waitLocalAgent,
} from "../overlay/packages/opencode/src/session/agent/local"

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

test("agent commands use real CLI flags", () => {
  expect(localAgentCommand("opencode", "do it", "/ws")).toEqual({
    command: "opencode",
    args: ["run", "--dir", "/ws", "do it"],
  })
  expect(localAgentCommand("hermes", "do it", "/ws")).toEqual({
    command: "hermes",
    args: ["chat", "-Q", "--query", "do it"],
  })
  expect(localAgentCommand("codex", "do it", "/ws")).toEqual({
    command: "codex",
    args: ["exec", "--cd", "/ws", "do it"],
  })
  expect(localAgentCommand("claude", "do it", "/ws")).toEqual({
    command: "claude",
    args: ["-p", "do it"],
  })
})

test("one-shot agents get stdin closed so stdin-draining CLIs exit", async () => {
  const record = spawnLocalAgentCommand({
    agent: "codex",
    task: "drain stdin",
    workspace: workspace("athagent-"),
    command: process.execPath,
    // Reads stdin to EOF before exiting; hangs forever if stdin stays open.
    args: ["-e", "process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write('drained'); process.exit(0) })"],
  })

  const done = await waitLocalAgent(record.handle, 5000)

  expect(done?.exitedAt).toBeDefined()
  expect(done?.exitCode).toBe(0)
  expect(done?.stdout).toBe("drained")
  expect(messageLocalAgent(record.handle, "too late")).toBe(false)
})

test("keepStdinOpen allows messaging and message reaches the agent", async () => {
  const record = spawnLocalAgentCommand({
    agent: "claude",
    task: "echo stdin",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "process.stdin.on('data', (d) => { process.stdout.write('got:' + d); process.exit(0) })"],
    keepStdinOpen: true,
  })

  expect(messageLocalAgent(record.handle, "hello")).toBe(true)
  const done = await waitLocalAgent(record.handle, 5000)

  expect(done?.exitCode).toBe(0)
  expect(done?.stdout).toBe("got:hello\n")
})

test("output offsets stay absolute across buffer truncation", async () => {
  const max = 1024 * 1024
  const record = spawnLocalAgentCommand({
    agent: "opencode",
    task: "flood stdout",
    workspace: workspace("athagent-"),
    // 1.5 MiB of 'a' then a recognizable tail marker.
    args: ["-e", `process.stdout.write("a".repeat(${Math.floor(max * 1.5)})); process.stdout.write("TAIL")`],
    command: process.execPath,
  })

  const done = await waitLocalAgent(record.handle, 10000)
  expect(done?.exitCode).toBe(0)

  const total = Math.floor(max * 1.5) + "TAIL".length
  expect(record.stdout.length).toBe(max)
  expect(record.stdoutDropped).toBe(total - max)

  // Reading from an absolute offset near the end returns just the tail.
  const tail = readLocalAgentOutput(record, "stdout", total - 4)
  expect(tail.text).toBe("TAIL")
  expect(tail.nextOffset).toBe(total)
  expect(tail.truncated).toBe(false)

  // An offset that fell off the buffer is flagged and reads from oldest data.
  const stale = readLocalAgentOutput(record, "stdout", 0)
  expect(stale.truncated).toBe(true)
  expect(stale.text.length).toBe(max)
  expect(stale.nextOffset).toBe(total)
})
