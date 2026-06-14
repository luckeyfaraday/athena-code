import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export type LocalAgentKind = "claude" | "codex" | "opencode" | "hermes"

export type LocalAgentRecord = {
  handle: string
  agent: LocalAgentKind
  task: string
  workspace: string
  pid?: number
  command: string
  args: string[]
  startedAt: string
  exitedAt?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  // The spawned agent's own session id, once known. claude gets one assigned
  // up front (--session-id); codex and hermes print theirs and are captured
  // from stdout as it streams; opencode is looked up lazily by title marker.
  sessionId?: string
  // Unique --title passed to `opencode run` so the session can be found in
  // opencode.db afterwards.
  sessionMarker?: string
  // True when the agent runs interactively in its own terminal window: no
  // stdout/stderr is captured and stdin cannot be messaged.
  visible?: boolean
  stdout: string
  stderr: string
  // Characters trimmed from the front of each buffer once it exceeds
  // MAX_BUFFER_CHARS. Offsets reported to callers are absolute positions in
  // the full stream (dropped + buffered), so they stay valid across trims.
  stdoutDropped: number
  stderrDropped: number
  process?: ChildProcessWithoutNullStreams
}

const MAX_BUFFER_CHARS = 1024 * 1024
const agents = new Map<string, LocalAgentRecord>()
const counts: Record<LocalAgentKind, number> = {
  claude: 0,
  codex: 0,
  opencode: 0,
  hermes: 0,
}

function appendBounded(record: LocalAgentRecord, channel: "stdout" | "stderr", chunk: string): void {
  const next = record[channel] + chunk
  const excess = next.length - MAX_BUFFER_CHARS
  if (excess <= 0) {
    record[channel] = next
    return
  }
  record[channel] = next.slice(excess)
  if (channel === "stdout") record.stdoutDropped += excess
  else record.stderrDropped += excess
}

// All four agents run as one-shot, non-interactive commands. Notably, hermes
// treats its first positional argument as a subcommand (the prompt goes through
// `chat --query`), and opencode's run command takes `--dir`, not `--cwd`.
//
// Each command is shaped so the spawned agent's session id is recoverable for
// agent_takeover: claude takes a pre-generated uuid, codex prints
// "session id: <uuid>" in its exec banner, hermes (without -Q) prints
// "Session: <id>" on exit, and opencode runs get a unique --title that is
// looked up in opencode.db afterwards.
export function localAgentCommand(
  agent: LocalAgentKind,
  task: string,
  workspace: string,
): { command: string; args: string[]; sessionId?: string; sessionMarker?: string } {
  if (agent === "codex") return { command: "codex", args: ["exec", "--cd", workspace, task] }
  if (agent === "claude") {
    const sessionId = randomUUID()
    return { command: "claude", args: ["-p", task, "--session-id", sessionId], sessionId }
  }
  if (agent === "opencode") {
    const sessionMarker = `athena-spawn ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    return { command: "opencode", args: ["run", "--dir", workspace, "--title", sessionMarker, task], sessionMarker }
  }
  return { command: "hermes", args: ["chat", "--query", task] }
}

// Interactive (own-terminal) invocation that starts the agent with the task
// already submitted as the first prompt. Hermes has no interactive
// initial-prompt mode, so it starts a plain chat instead.
export function localAgentInteractiveCommand(
  agent: LocalAgentKind,
  task: string,
  workspace: string,
): { command: string; args: string[]; sessionId?: string; promptInjected: boolean } {
  if (agent === "codex") return { command: "codex", args: ["--cd", workspace, task], promptInjected: true }
  if (agent === "claude") {
    const sessionId = randomUUID()
    return { command: "claude", args: [task, "--session-id", sessionId], sessionId, promptInjected: true }
  }
  if (agent === "opencode") return { command: "opencode", args: [workspace, "--prompt", task], promptInjected: true }
  return { command: "hermes", args: ["chat"], promptInjected: false }
}

// Headless continuation: resume the agent's existing session one-shot with a
// follow-up prompt. This is how agent_message reaches one-shot agents whose
// stdin is closed (or already exited), including sessions the user advanced
// interactively via agent_takeover — the same session id picks up the whole
// conversation. codex's exec resume has no --cd; the spawn cwd covers it.
export function localAgentContinueCommand(
  agent: LocalAgentKind,
  sessionId: string,
  task: string,
  workspace: string,
): { command: string; args: string[] } {
  switch (agent) {
    case "claude":
      return { command: "claude", args: ["-p", "--resume", sessionId, task] }
    case "codex":
      return { command: "codex", args: ["exec", "resume", sessionId, task] }
    case "opencode":
      return { command: "opencode", args: ["run", "--dir", workspace, "--session", sessionId, task] }
    case "hermes":
      return { command: "hermes", args: ["chat", "--resume", sessionId, "--query", task] }
  }
}

// Native resume invocation per agent, mirroring the TUI's /find-sessions
// resume table (packages/tui/src/util/athena-sessions.ts).
export function localAgentResumeCommand(
  agent: LocalAgentKind,
  sessionId: string,
  workspace: string,
): { command: string; args: string[] } {
  switch (agent) {
    case "claude":
      return { command: "claude", args: ["--resume", sessionId] }
    case "codex":
      return { command: "codex", args: ["resume", "--cd", workspace, sessionId] }
    case "opencode":
      return { command: "opencode", args: [workspace, "--session", sessionId] }
    case "hermes":
      return { command: "hermes", args: ["--resume", sessionId] }
  }
}

export function spawnLocalAgent(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
}): LocalAgentRecord {
  const spec = localAgentCommand(params.agent, params.task, params.workspace)
  return spawnLocalAgentCommand({
    ...params,
    command: spec.command,
    args: spec.args,
    sessionId: spec.sessionId,
    sessionMarker: spec.sessionMarker,
  })
}

// Capture the session id the agent prints, while the banner/footer is still
// in the bounded buffer. codex announces it up front; hermes on exit.
function captureSessionId(record: LocalAgentRecord): void {
  if (record.sessionId) return
  const pattern =
    record.agent === "codex"
      ? /^session id:\s*([0-9a-f][0-9a-f-]{7,})/im
      : record.agent === "hermes"
        ? /^Session:\s*(\S+)/im
        : null
  if (!pattern) return
  const match = record.stdout.match(pattern) ?? record.stderr.match(pattern)
  if (match) record.sessionId = match[1]
}

function allocHandle(agent: LocalAgentKind): string {
  counts[agent] += 1
  return `${agent}#${counts[agent]}`
}

// Wire a freshly spawned child into a record: buffer its output, capture the
// session id as it streams, and mark the record exited on close. Shared by
// the initial spawn and headless continuations under the same handle.
function attachProcess(record: LocalAgentRecord, child: ChildProcessWithoutNullStreams, keepStdinOpen?: boolean): void {
  record.pid = child.pid
  record.process = child
  record.exitedAt = undefined
  record.exitCode = undefined
  record.signal = undefined

  // One-shot commands take the task as an argument; close stdin so CLIs that
  // also read piped stdin to EOF (codex exec appends it as a <stdin> block,
  // claude -p stalls 3s waiting for it) don't hang or delay.
  child.stdin.on("error", () => {})
  if (!keepStdinOpen) child.stdin.end()

  child.stdout.on("data", (chunk) => {
    appendBounded(record, "stdout", chunk.toString("utf8"))
    captureSessionId(record)
  })
  child.stderr.on("data", (chunk) => {
    appendBounded(record, "stderr", chunk.toString("utf8"))
    captureSessionId(record)
  })
  child.on("error", (error) => {
    appendBounded(record, "stderr", `${error.message}\n`)
  })
  child.on("close", (code, signal) => {
    record.exitCode = code
    record.signal = signal
    record.exitedAt = new Date().toISOString()
    delete record.process
  })
}

export function spawnLocalAgentCommand(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
  command: string
  args: string[]
  keepStdinOpen?: boolean
  sessionId?: string
  sessionMarker?: string
}): LocalAgentRecord {
  const handle = allocHandle(params.agent)
  const child = spawn(params.command, params.args, {
    cwd: params.workspace,
    env: process.env,
    stdio: "pipe",
  })
  const record: LocalAgentRecord = {
    handle,
    agent: params.agent,
    task: params.task,
    workspace: params.workspace,
    pid: child.pid,
    command: params.command,
    args: params.args,
    startedAt: new Date().toISOString(),
    sessionId: params.sessionId,
    sessionMarker: params.sessionMarker,
    stdout: "",
    stderr: "",
    stdoutDropped: 0,
    stderrDropped: 0,
    process: child,
  }
  agents.set(handle, record)
  attachProcess(record, child, params.keepStdinOpen)
  return record
}

// Run a follow-up command under an existing exited record (same handle, same
// buffers). A marker line separates the runs in the captured stdout so
// agent_output readers can tell the turns apart.
export function respawnLocalAgent(
  record: LocalAgentRecord,
  spec: { command: string; args: string[] },
  task: string,
): void {
  appendBounded(record, "stdout", `\n----- follow-up: ${task}\n`)
  record.command = spec.command
  record.args = spec.args
  record.visible = false
  const child = spawn(spec.command, spec.args, {
    cwd: record.workspace,
    env: process.env,
    stdio: "pipe",
  })
  attachProcess(record, child)
}

export type ContinueResult =
  | { status: "missing" | "running" | "terminal" | "no-session" }
  | { status: "stdin" | "resumed"; record: LocalAgentRecord }

export type TakeoverBlockReason = "running" | "terminal"

export function localAgentTakeoverBlockReason(record: LocalAgentRecord): TakeoverBlockReason | undefined {
  if (record.visible) return "terminal"
  if (record.process) return "running"
  return undefined
}

// Deliver a follow-up message to a spawned agent. Live agents with open stdin
// get it written directly; exited headless agents get their session resumed
// with the message as the next prompt, under the same handle. Agents owned by
// a visible terminal are blocked because Athena can't observe when the user is
// done with that terminal, and two writers corrupt one session.
export async function continueLocalAgent(handle: string, text: string): Promise<ContinueResult> {
  const record = agents.get(handle)
  if (!record) return { status: "missing" }
  if (messageLocalAgent(handle, text)) return { status: "stdin", record }
  if (record.visible) return { status: "terminal" }
  if (record.process) return { status: "running" }
  const sessionId = await resolveLocalAgentSessionId(record)
  if (!sessionId) return { status: "no-session" }
  respawnLocalAgent(record, localAgentContinueCommand(record.agent, sessionId, text, record.workspace), text)
  return { status: "resumed", record }
}

export function listLocalAgents(): LocalAgentRecord[] {
  return [...agents.values()]
}

export function getLocalAgent(handle: string): LocalAgentRecord | undefined {
  return agents.get(handle)
}

export function messageLocalAgent(handle: string, text: string): boolean {
  const record = agents.get(handle)
  const stdin = record?.process?.stdin
  if (!stdin || stdin.destroyed || stdin.writableEnded) return false
  stdin.write(`${text}\n`)
  return true
}

// Read a channel's output from an absolute stream offset. Offsets count from
// the start of everything the agent ever wrote; if the buffer has trimmed past
// the requested offset, `truncated` is true and the read starts at the oldest
// data still buffered.
export function readLocalAgentOutput(
  record: LocalAgentRecord,
  channel: "stdout" | "stderr",
  offset: number,
): { text: string; nextOffset: number; truncated: boolean } {
  const dropped = channel === "stdout" ? record.stdoutDropped : record.stderrDropped
  const buffer = record[channel]
  const start = Math.max(0, Math.min(offset, dropped + buffer.length) - dropped)
  return {
    text: buffer.slice(start),
    nextOffset: dropped + buffer.length,
    truncated: offset < dropped,
  }
}

export function stopLocalAgent(handle: string): boolean {
  const record = agents.get(handle)
  if (!record?.process) return false
  return record.process.kill("SIGTERM")
}

// Track an agent that runs interactively in its own terminal window. The
// terminal emulator owns the process, so there is no output capture and no
// stdin; the record exists so agent_list shows it and agent_takeover can
// resume the session later (when its id is known).
export function registerVisibleAgent(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
  command: string
  args: string[]
  pid?: number
  sessionId?: string
}): LocalAgentRecord {
  const record: LocalAgentRecord = {
    handle: allocHandle(params.agent),
    agent: params.agent,
    task: params.task,
    workspace: params.workspace,
    pid: params.pid,
    command: params.command,
    args: params.args,
    startedAt: new Date().toISOString(),
    sessionId: params.sessionId,
    visible: true,
    stdout: "",
    stderr: "",
    stdoutDropped: 0,
    stderrDropped: 0,
  }
  agents.set(record.handle, record)
  return record
}

// Resolve the spawned agent's session id, looking opencode runs up by their
// unique --title marker in opencode.db (read-only; same source the session
// scanner in ../memory/agentscan.ts reads).
export async function resolveLocalAgentSessionId(record: LocalAgentRecord): Promise<string | undefined> {
  captureSessionId(record)
  if (record.sessionId) return record.sessionId
  if (record.agent !== "opencode" || !record.sessionMarker) return undefined
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  const dbPath = process.env.ATHENA_SCAN_OPENCODE_DB || join(xdgData, "opencode", "opencode.db")
  if (!existsSync(dbPath)) return undefined
  try {
    const { Database } = await import("bun:sqlite")
    const db = new Database(dbPath, { readonly: true })
    try {
      db.run("PRAGMA busy_timeout = 2000")
      const row = db
        .query("SELECT id FROM session WHERE title = ? ORDER BY time_updated DESC LIMIT 1")
        .get(record.sessionMarker) as { id: string } | null
      if (row?.id) record.sessionId = row.id
      return record.sessionId
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export async function waitLocalAgent(handle: string, timeoutMs: number): Promise<LocalAgentRecord | undefined> {
  const record = agents.get(handle)
  if (!record) return undefined
  if (!record.process) return record
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(1, timeoutMs))
    record.process?.once("close", () => {
      clearTimeout(timer)
      resolve()
    })
  })
  return record
}
