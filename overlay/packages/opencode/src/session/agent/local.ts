import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

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
export function localAgentCommand(agent: LocalAgentKind, task: string, workspace: string): { command: string; args: string[] } {
  if (agent === "codex") return { command: "codex", args: ["exec", "--cd", workspace, task] }
  if (agent === "claude") return { command: "claude", args: ["-p", task] }
  if (agent === "opencode") return { command: "opencode", args: ["run", "--dir", workspace, task] }
  return { command: "hermes", args: ["chat", "-Q", "--query", task] }
}

export function spawnLocalAgent(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
}): LocalAgentRecord {
  const spec = localAgentCommand(params.agent, params.task, params.workspace)
  return spawnLocalAgentCommand({ ...params, command: spec.command, args: spec.args })
}

export function spawnLocalAgentCommand(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
  command: string
  args: string[]
  keepStdinOpen?: boolean
}): LocalAgentRecord {
  counts[params.agent] += 1
  const handle = `${params.agent}#${counts[params.agent]}`
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
    stdout: "",
    stderr: "",
    stdoutDropped: 0,
    stderrDropped: 0,
    process: child,
  }
  agents.set(handle, record)

  // One-shot commands take the task as an argument; close stdin so CLIs that
  // also read piped stdin to EOF (codex exec appends it as a <stdin> block,
  // claude -p stalls 3s waiting for it) don't hang or delay.
  child.stdin.on("error", () => {})
  if (!params.keepStdinOpen) child.stdin.end()

  child.stdout.on("data", (chunk) => {
    appendBounded(record, "stdout", chunk.toString("utf8"))
  })
  child.stderr.on("data", (chunk) => {
    appendBounded(record, "stderr", chunk.toString("utf8"))
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

  return record
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
