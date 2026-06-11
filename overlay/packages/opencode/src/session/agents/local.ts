import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

export const LOCAL_AGENT_KINDS = ["claude", "codex", "opencode", "hermes"] as const

export type LocalAgentKind = (typeof LOCAL_AGENT_KINDS)[number]
export type LocalAgentStatus = "running" | "exited" | "error"

export interface LocalAgentSpawnRequest {
  kind: LocalAgentKind
  workspace: string
  task: string
}

export interface LocalAgentCommand {
  argv: string[]
  cwd: string
}

export interface LocalManagedAgent {
  handle: string
  kind: LocalAgentKind
  workspace: string
  task: string
  argv: string[]
  cwd: string
  pid?: number
  status: LocalAgentStatus
  startedAt: string
  exitedAt?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  error?: string
  output: string
}

interface AgentRecord extends LocalManagedAgent {
  child?: ChildProcessWithoutNullStreams
}

const OUTPUT_LIMIT = 12_000
const registry = new Map<string, AgentRecord>()
const counters = new Map<LocalAgentKind, number>()

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function safeWorkspace(workspace: string): string {
  const resolved = resolve(workspace || process.cwd())
  return isDirectory(resolved) ? resolved : process.cwd()
}

function appendOutput(agent: AgentRecord, chunk: Buffer | string) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8")
  agent.output = (agent.output + text).slice(-OUTPUT_LIMIT)
}

function nextHandle(kind: LocalAgentKind): string {
  const next = (counters.get(kind) ?? 0) + 1
  counters.set(kind, next)
  return `${kind}#${next}`
}

function logPath(handle: string): string {
  const dir = join(resolve(process.env.ATHENA_CODE_HOME || join(homedir(), ".athena-code")), "agents")
  mkdirSync(dir, { recursive: true })
  return join(dir, `${handle.replace(/[^a-z0-9#_-]/gi, "_")}.log`)
}

function writeLog(handle: string, output: string) {
  try {
    writeFileSync(logPath(handle), output)
  } catch {
    // Agent lifecycle should not be able to fail a chat turn because logging failed.
  }
}

export function parseLocalAgentKind(value: string): LocalAgentKind | null {
  const normalized = value.trim().toLowerCase()
  return (LOCAL_AGENT_KINDS as readonly string[]).includes(normalized) ? (normalized as LocalAgentKind) : null
}

export function localAgentCommand(input: LocalAgentSpawnRequest): LocalAgentCommand {
  const cwd = safeWorkspace(input.workspace)
  const task = input.task.trim()
  switch (input.kind) {
    case "claude":
      return { argv: task ? ["claude", task] : ["claude"], cwd }
    case "codex":
      return { argv: task ? ["codex", "exec", "--cd", cwd, task] : ["codex", "--cd", cwd], cwd }
    case "opencode":
      return { argv: task ? ["opencode", "run", "--dir", cwd, task] : ["opencode", cwd], cwd }
    case "hermes":
      return { argv: task ? ["hermes", task] : ["hermes"], cwd }
  }
}

export function spawnLocalAgent(input: LocalAgentSpawnRequest): LocalManagedAgent {
  const command = localAgentCommand(input)
  const handle = nextHandle(input.kind)
  const agent: AgentRecord = {
    handle,
    kind: input.kind,
    workspace: command.cwd,
    task: input.task.trim(),
    argv: command.argv,
    cwd: command.cwd,
    status: "running",
    startedAt: new Date().toISOString(),
    output: "",
  }
  registry.set(handle, agent)

  const child = spawn(command.argv[0]!, command.argv.slice(1), {
    cwd: command.cwd,
    env: process.env,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
  })
  agent.child = child
  agent.pid = child.pid

  child.stdout.on("data", (chunk) => appendOutput(agent, chunk))
  child.stderr.on("data", (chunk) => appendOutput(agent, chunk))
  child.on("error", (error) => {
    agent.status = "error"
    agent.error = error instanceof Error ? error.message : String(error)
    agent.exitedAt = new Date().toISOString()
    appendOutput(agent, `\n[athena] ${agent.error}\n`)
    writeLog(handle, agent.output)
  })
  child.on("exit", (code, signal) => {
    agent.status = agent.status === "error" ? "error" : "exited"
    agent.exitCode = code
    agent.signal = signal
    agent.exitedAt = new Date().toISOString()
    writeLog(handle, agent.output)
  })
  return publicAgent(agent)
}

export function listLocalAgents(): LocalManagedAgent[] {
  return Array.from(registry.values()).map(publicAgent)
}

export function getLocalAgent(handle: string): LocalManagedAgent | null {
  const agent = registry.get(handle)
  return agent ? publicAgent(agent) : null
}

export function sendLocalAgentMessage(handle: string, text: string): LocalManagedAgent {
  const agent = registry.get(handle)
  if (!agent) throw new Error(`No agent found for ${handle}`)
  if (agent.status !== "running" || !agent.child?.stdin.writable) throw new Error(`${handle} is not accepting input`)
  const message = text.trim()
  if (!message) throw new Error("Message is empty")
  agent.child.stdin.write(`${message}\n`)
  appendOutput(agent, `\n[athena -> ${handle}] ${message}\n`)
  return publicAgent(agent)
}

export function stopLocalAgent(handle: string): LocalManagedAgent {
  const agent = registry.get(handle)
  if (!agent) throw new Error(`No agent found for ${handle}`)
  if (agent.status === "running") agent.child?.kill("SIGTERM")
  return publicAgent(agent)
}

function publicAgent(agent: AgentRecord): LocalManagedAgent {
  const { child: _child, ...rest } = agent
  return { ...rest }
}

export function formatLocalAgentSummary(agent: LocalManagedAgent): string {
  const pid = agent.pid ? ` pid ${agent.pid}` : ""
  const exit = agent.status === "exited" ? ` exit ${agent.exitCode ?? "signal " + agent.signal}` : ""
  return `${agent.handle} ${agent.status}${pid}${exit} · ${agent.task || agent.argv.join(" ")}`
}

export function clearLocalAgentsForTest() {
  for (const agent of registry.values()) {
    if (agent.status === "running") agent.child?.kill("SIGTERM")
  }
  registry.clear()
  counters.clear()
}
