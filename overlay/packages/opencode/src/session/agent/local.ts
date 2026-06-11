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
  process?: ChildProcessWithoutNullStreams
}

const MAX_BUFFER_BYTES = 1024 * 1024
const agents = new Map<string, LocalAgentRecord>()
const counts: Record<LocalAgentKind, number> = {
  claude: 0,
  codex: 0,
  opencode: 0,
  hermes: 0,
}

function appendBounded(current: string, chunk: string): string {
  const next = current + chunk
  if (Buffer.byteLength(next, "utf8") <= MAX_BUFFER_BYTES) return next
  return next.slice(Math.max(0, next.length - MAX_BUFFER_BYTES))
}

function commandFor(agent: LocalAgentKind, task: string, workspace: string): { command: string; args: string[] } {
  if (agent === "codex") return { command: "codex", args: ["exec", "--cd", workspace, task] }
  if (agent === "claude") return { command: "claude", args: ["-p", task] }
  if (agent === "opencode") return { command: "opencode", args: ["run", "--cwd", workspace, task] }
  return { command: "hermes", args: [task] }
}

export function spawnLocalAgent(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
}): LocalAgentRecord {
  const spec = commandFor(params.agent, params.task, params.workspace)
  return spawnLocalAgentCommand({ ...params, command: spec.command, args: spec.args })
}

export function spawnLocalAgentCommand(params: {
  agent: LocalAgentKind
  task: string
  workspace: string
  command: string
  args: string[]
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
    process: child,
  }
  agents.set(handle, record)

  child.stdout.on("data", (chunk) => {
    record.stdout = appendBounded(record.stdout, chunk.toString("utf8"))
  })
  child.stderr.on("data", (chunk) => {
    record.stderr = appendBounded(record.stderr, chunk.toString("utf8"))
  })
  child.on("error", (error) => {
    record.stderr = appendBounded(record.stderr, `${error.message}\n`)
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
  if (!record?.process || record.process.stdin.destroyed) return false
  record.process.stdin.write(`${text}\n`)
  return true
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
