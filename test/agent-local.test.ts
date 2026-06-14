import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  continueLocalAgent,
  localAgentCommand,
  localAgentContinueCommand,
  localAgentInteractiveCommand,
  localAgentResumeCommand,
  localAgentTakeoverBlockReason,
  messageLocalAgent,
  readLocalAgentOutput,
  registerVisibleAgent,
  resolveLocalAgentSessionId,
  respawnLocalAgent,
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

test("agent commands use real CLI flags and recoverable session ids", () => {
  const opencode = localAgentCommand("opencode", "do it", "/ws")
  expect(opencode.command).toBe("opencode")
  expect(opencode.args.slice(0, 3)).toEqual(["run", "--dir", "/ws"])
  expect(opencode.args[3]).toBe("--title")
  expect(opencode.sessionMarker).toMatch(/^athena-spawn /)
  expect(opencode.args[4]).toBe(opencode.sessionMarker!)
  expect(opencode.args[5]).toBe("do it")

  // hermes must NOT be quiet: -Q suppresses the "Session: <id>" line that
  // session-id capture parses.
  expect(localAgentCommand("hermes", "do it", "/ws")).toEqual({
    command: "hermes",
    args: ["chat", "--query", "do it"],
  })
  expect(localAgentCommand("codex", "do it", "/ws")).toEqual({
    command: "codex",
    args: ["exec", "--cd", "/ws", "do it"],
  })

  const claude = localAgentCommand("claude", "do it", "/ws")
  expect(claude.command).toBe("claude")
  expect(claude.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(claude.args).toEqual(["-p", "do it", "--session-id", claude.sessionId!])
})

test("interactive commands pre-submit the task where the CLI supports it", () => {
  expect(localAgentInteractiveCommand("codex", "do it", "/ws")).toEqual({
    command: "codex",
    args: ["--cd", "/ws", "do it"],
    promptInjected: true,
  })
  expect(localAgentInteractiveCommand("opencode", "do it", "/ws")).toEqual({
    command: "opencode",
    args: ["/ws", "--prompt", "do it"],
    promptInjected: true,
  })
  const claude = localAgentInteractiveCommand("claude", "do it", "/ws")
  expect(claude.args).toEqual(["do it", "--session-id", claude.sessionId!])
  expect(claude.promptInjected).toBe(true)
  expect(localAgentInteractiveCommand("hermes", "do it", "/ws").promptInjected).toBe(false)
})

test("resume commands mirror the /find-sessions table", () => {
  expect(localAgentResumeCommand("claude", "sid", "/ws")).toEqual({ command: "claude", args: ["--resume", "sid"] })
  expect(localAgentResumeCommand("codex", "sid", "/ws")).toEqual({
    command: "codex",
    args: ["resume", "--cd", "/ws", "sid"],
  })
  expect(localAgentResumeCommand("opencode", "sid", "/ws")).toEqual({
    command: "opencode",
    args: ["/ws", "--session", "sid"],
  })
  expect(localAgentResumeCommand("hermes", "sid", "/ws")).toEqual({ command: "hermes", args: ["--resume", "sid"] })
})

test("codex session id is captured from the exec banner", async () => {
  const banner = "OpenAI Codex v0.139.0\\n--------\\nsession id: 019ebdfc-c899-73d0-a35d-ad08c1e1ce3f\\n--------\\n"
  const record = spawnLocalAgentCommand({
    agent: "codex",
    task: "banner",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", `process.stdout.write("${banner}")`],
  })
  await waitLocalAgent(record.handle, 5000)
  expect(await resolveLocalAgentSessionId(record)).toBe("019ebdfc-c899-73d0-a35d-ad08c1e1ce3f")
})

test("hermes session id is captured from the exit footer", async () => {
  const footer = "Resume this session with:\\nSession:        20260613_003904_6a836b\\n"
  const record = spawnLocalAgentCommand({
    agent: "hermes",
    task: "footer",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", `process.stdout.write("${footer}")`],
  })
  await waitLocalAgent(record.handle, 5000)
  expect(await resolveLocalAgentSessionId(record)).toBe("20260613_003904_6a836b")
})

test("opencode session id resolves via title marker in opencode.db", async () => {
  const { Database } = await import("bun:sqlite")
  const dir = workspace("athagent-db-")
  const dbPath = join(dir, "opencode.db")
  const db = new Database(dbPath)
  db.run("CREATE TABLE session (id TEXT, title TEXT, time_updated INTEGER)")
  db.run("INSERT INTO session VALUES ('ses_old', 'athena-spawn marker1', 1), ('ses_new', 'athena-spawn marker1', 2)")
  db.close()

  const previous = process.env.ATHENA_SCAN_OPENCODE_DB
  process.env.ATHENA_SCAN_OPENCODE_DB = dbPath
  try {
    const record = registerVisibleAgent({
      agent: "opencode",
      task: "marker lookup",
      workspace: dir,
      command: "opencode",
      args: [],
    })
    record.sessionMarker = "athena-spawn marker1"
    expect(await resolveLocalAgentSessionId(record)).toBe("ses_new")
    expect(record.sessionId).toBe("ses_new")
  } finally {
    if (previous === undefined) delete process.env.ATHENA_SCAN_OPENCODE_DB
    else process.env.ATHENA_SCAN_OPENCODE_DB = previous
  }
})

test("continue commands resume the same session with a follow-up prompt", () => {
  expect(localAgentContinueCommand("claude", "sid", "do more", "/ws")).toEqual({
    command: "claude",
    args: ["-p", "--resume", "sid", "do more"],
  })
  // codex exec resume has no --cd flag; the spawn cwd carries the workspace.
  expect(localAgentContinueCommand("codex", "sid", "do more", "/ws")).toEqual({
    command: "codex",
    args: ["exec", "resume", "sid", "do more"],
  })
  expect(localAgentContinueCommand("opencode", "sid", "do more", "/ws")).toEqual({
    command: "opencode",
    args: ["run", "--dir", "/ws", "--session", "sid", "do more"],
  })
  expect(localAgentContinueCommand("hermes", "sid", "do more", "/ws")).toEqual({
    command: "hermes",
    args: ["chat", "--resume", "sid", "--query", "do more"],
  })
})

test("respawn reuses the handle and appends to the same output buffer", async () => {
  const record = spawnLocalAgentCommand({
    agent: "codex",
    task: "first run",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "process.stdout.write('first')"],
  })
  await waitLocalAgent(record.handle, 5000)
  expect(record.exitedAt).toBeDefined()

  respawnLocalAgent(record, { command: process.execPath, args: ["-e", "process.stdout.write('second')"] }, "follow-up task")
  expect(record.exitedAt).toBeUndefined()
  const done = await waitLocalAgent(record.handle, 5000)

  expect(done?.exitCode).toBe(0)
  expect(record.stdout).toBe("first\n----- follow-up: follow-up task\nsecond")
})

test("continueLocalAgent reports mid-run one-shots and unknown sessions", async () => {
  const running = spawnLocalAgentCommand({
    agent: "codex",
    task: "long run",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 3000)"],
  })
  expect((await continueLocalAgent(running.handle, "too early")).status).toBe("running")
  running.process?.kill("SIGKILL")
  await waitLocalAgent(running.handle, 5000)
  // Exited with no session id captured: cannot be resumed.
  expect((await continueLocalAgent(running.handle, "now what")).status).toBe("no-session")
  expect((await continueLocalAgent("codex#999", "ghost")).status).toBe("missing")
})

test("takeover is blocked for running headless agents without killing them", async () => {
  const running = spawnLocalAgentCommand({
    agent: "codex",
    task: "long run",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 3000)"],
  })

  expect(localAgentTakeoverBlockReason(running)).toBe("running")
  expect(running.process).toBeDefined()
  expect(running.exitedAt).toBeUndefined()

  running.process?.kill("SIGKILL")
  await waitLocalAgent(running.handle, 5000)
  expect(localAgentTakeoverBlockReason(running)).toBeUndefined()
})

test("continueLocalAgent writes to stdin when the agent keeps it open", async () => {
  const record = spawnLocalAgentCommand({
    agent: "claude",
    task: "echo stdin",
    workspace: workspace("athagent-"),
    command: process.execPath,
    args: ["-e", "process.stdin.on('data', (d) => { process.stdout.write('got:' + d); process.exit(0) })"],
    keepStdinOpen: true,
  })
  expect((await continueLocalAgent(record.handle, "hi")).status).toBe("stdin")
  const done = await waitLocalAgent(record.handle, 5000)
  expect(done?.stdout).toBe("got:hi\n")
})

test("visible agents are listed but not resumed headless", async () => {
  const record = registerVisibleAgent({
    agent: "claude",
    task: "visible run",
    workspace: workspace("athagent-"),
    command: "claude",
    args: ["visible run"],
    sessionId: "uuid-1",
  })
  expect(record.visible).toBe(true)
  expect(localAgentTakeoverBlockReason(record)).toBe("terminal")
  expect(messageLocalAgent(record.handle, "hello")).toBe(false)
  expect((await continueLocalAgent(record.handle, "hello")).status).toBe("terminal")
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
