import { statSync } from "node:fs"
import { tool } from "@opencode-ai/plugin"
import { GlobalBus } from "../bus/global"
import { normalizeWorktree } from "../plugin/workspace"
import {
  getLocalAgent,
  listLocalAgents,
  localAgentInteractiveCommand,
  localAgentResumeCommand,
  messageLocalAgent,
  readLocalAgentOutput,
  registerVisibleAgent,
  resolveLocalAgentSessionId,
  spawnLocalAgent,
  stopLocalAgent,
  waitLocalAgent,
  type LocalAgentKind,
  type LocalAgentRecord,
} from "../session/agent/local"
import { openVisibleTerminal } from "../session/agent/terminal"

const AGENTS = ["claude", "codex", "opencode", "hermes"] as const

function isAgent(value: string): value is LocalAgentKind {
  return AGENTS.includes(value as LocalAgentKind)
}

function status(record: LocalAgentRecord): string {
  if (record.visible) return `visible terminal · session ${record.sessionId ?? "unknown"}`
  if (record.exitedAt) return `exited pid ${record.pid ?? "?"} exit ${record.exitCode ?? record.signal ?? "?"}`
  return `running pid ${record.pid ?? "?"}`
}

function render(record: LocalAgentRecord): string {
  return `${record.handle} ${status(record)} · ${record.task}`
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export const AgentSpawnTool = tool({
  description:
    "Spawn a local coding agent subprocess from the user's prompt. Use when the user asks to spawn, start, delegate to, or hand work to Claude Code, Codex, OpenCode, or Hermes. By default runs headless and captures stdout/stderr for agent_output and agent_wait. Pass visible=true when the user wants the agent in its own visible terminal window they can work in directly.",
  args: {
    agent: tool.schema.string().describe('Agent to spawn. Must be one of: "claude", "codex", "opencode", or "hermes".'),
    task: tool.schema.string().describe("Task prompt to pass to the spawned agent."),
    workspace: tool.schema.string().optional().describe("Workspace directory. Omit to use the current Athena Code workspace."),
    visible: tool.schema
      .boolean()
      .optional()
      .describe(
        "Open the agent interactively in a new visible terminal window with the task pre-submitted, instead of running it headless. Use when the user wants to see or drive the agent themselves.",
      ),
  },
  async execute(args, context) {
    const agent = args.agent.trim().toLowerCase()
    if (!isAgent(agent)) {
      return { title: "Unknown agent", metadata: { error: true }, output: `Unknown agent ${JSON.stringify(args.agent)}.` }
    }
    const workspace = args.workspace || normalizeWorktree(context)
    if (!isDirectory(workspace)) {
      return { title: "Invalid workspace", metadata: { error: true }, output: `Workspace ${JSON.stringify(workspace)} is not a directory.` }
    }
    if (args.visible) {
      const spec = localAgentInteractiveCommand(agent, args.task, workspace)
      const launch = openVisibleTerminal([spec.command, ...spec.args], workspace)
      if (!launch.ok) {
        return { title: "Terminal launch failed", metadata: { error: true }, output: launch.error ?? "Could not open a terminal window." }
      }
      const record = registerVisibleAgent({
        agent,
        task: args.task,
        workspace,
        command: spec.command,
        args: spec.args,
        sessionId: spec.sessionId,
      })
      const note = spec.promptInjected
        ? `The task prompt was pre-submitted.`
        : `${agent} cannot pre-fill a prompt; the user must paste the task into the new window.`
      return {
        title: "Agent opened in terminal",
        metadata: { handle: record.handle, terminal: launch.terminal },
        output: `${render(record)}\nOpened in a new ${launch.terminal} window. ${note} Output is not captured for visible agents.`,
      }
    }
    const record = spawnLocalAgent({ agent, task: args.task, workspace })
    return { title: "Agent spawned", metadata: { handle: record.handle, pid: record.pid }, output: render(record) }
  },
})

// In-app takeover handshake: the tool can't swap the user's terminal itself,
// so it publishes this event on the GlobalBus (the same stream that feeds the
// TUI's SSE event feed); the Athena TUI listener execs the agent's native
// resume command in place, exactly like picking the session in /find-sessions.
export const TAKEOVER_EVENT = "athena.agent.takeover"

export const AgentTakeoverTool = tool({
  description:
    "Hand a spawned local agent's session over to the user so they can continue the conversation themselves. Use when the user asks to take over, attach to, open, or continue working in a spawned agent's session. where=in_app swaps this terminal into the agent (default); where=terminal opens the resumed agent in a new visible terminal window.",
  args: {
    handle: tool.schema.string().describe('Agent handle from agent_spawn, for example "claude#1" or "codex#1".'),
    where: tool.schema
      .enum(["in_app", "terminal"])
      .optional()
      .describe('Where to open the session: "in_app" (default) takes over the current terminal; "terminal" opens a new visible terminal window.'),
  },
  async execute(args, context) {
    const record = getLocalAgent(args.handle)
    if (!record) {
      return { title: "Agent not found", metadata: { error: true, handle: args.handle }, output: `${args.handle} does not exist.` }
    }
    // Two writers on one session conflict, so stop a still-running headless
    // agent and give it a moment to flush its session file before resuming.
    if (!record.visible && record.process) {
      stopLocalAgent(args.handle)
      await waitLocalAgent(args.handle, 8000)
    }
    const sessionId = await resolveLocalAgentSessionId(record)
    if (!sessionId) {
      return {
        title: "Session id unknown",
        metadata: { error: true, handle: args.handle },
        output: `Could not determine the session id for ${args.handle}. Suggest the user run /find-sessions to locate and resume it manually.`,
      }
    }
    const resume = localAgentResumeCommand(record.agent, sessionId, record.workspace)
    if (args.where === "terminal") {
      const launch = openVisibleTerminal([resume.command, ...resume.args], record.workspace)
      if (!launch.ok) {
        return { title: "Terminal launch failed", metadata: { error: true }, output: launch.error ?? "Could not open a terminal window." }
      }
      return {
        title: "Session opened in terminal",
        metadata: { handle: record.handle, sessionId, terminal: launch.terminal },
        output: `Resumed ${record.agent} session ${sessionId} in a new ${launch.terminal} window.`,
      }
    }
    GlobalBus.emit("event", {
      directory: context.directory,
      payload: {
        type: TAKEOVER_EVENT,
        properties: {
          agent: record.agent,
          sessionId,
          workspace: record.workspace,
          requestSessionID: context.sessionID,
        },
      },
    })
    return {
      title: "Handing over session",
      metadata: { handle: record.handle, sessionId },
      output: `Handing this terminal over to ${record.agent} session ${sessionId}. Athena Code returns when the user exits ${record.agent}. If nothing happens (e.g. no TUI attached), the user can run /find-sessions instead.`,
    }
  },
})

export const AgentListTool = tool({
  description: "List local coding agents spawned by this Athena Code process. Use when the user asks which agents are spawned, running, active, or available to message.",
  args: {},
  async execute() {
    const records = listLocalAgents()
    return { title: "Agents", metadata: { count: records.length }, output: records.length ? records.map(render).join("\n") : "No spawned agents." }
  },
})

export const AgentMessageTool = tool({
  description: "Send a follow-up instruction over stdin to a running local agent spawned by Athena Code. Note: agents spawned by agent_spawn run one-shot commands with stdin closed and cannot be messaged; this only works for custom-command agents that keep stdin open.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
    text: tool.schema.string().describe("Message to send to the agent over stdin."),
  },
  async execute(args) {
    const ok = messageLocalAgent(args.handle, args.text)
    return { title: ok ? "Agent messaged" : "Agent not accepting input", metadata: { handle: args.handle, ok }, output: ok ? `Sent message to ${args.handle}.` : `${args.handle} does not exist, has exited, or runs a one-shot command with stdin closed.` }
  },
})

export const AgentStopTool = tool({
  description: "Stop a running local agent spawned by Athena Code. Use when the user asks to stop, kill, or terminate a specific spawned agent handle.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
  },
  async execute(args) {
    const record = getLocalAgent(args.handle)
    const ok = stopLocalAgent(args.handle)
    return { title: ok ? "Agent stopped" : "Agent not running", metadata: { handle: args.handle, ok }, output: record ? render(record) : `${args.handle} does not exist.` }
  },
})

export const AgentOutputTool = tool({
  description:
    "Read buffered stdout/stderr from a local agent spawned by Athena Code without waiting for it to exit. Use to monitor a spawned agent in real time.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
    stdout_offset: tool.schema.number().optional().describe("Absolute character offset into the agent's full stdout stream to start from. Pass stdout_next_offset from the previous call to read only new output."),
    stderr_offset: tool.schema.number().optional().describe("Absolute character offset into the agent's full stderr stream to start from. Pass stderr_next_offset from the previous call to read only new output."),
  },
  async execute(args) {
    const record = getLocalAgent(args.handle)
    if (!record) return { title: "Agent not found", metadata: { error: true, handle: args.handle }, output: `${args.handle} does not exist.` }
    const stdout = readLocalAgentOutput(record, "stdout", Math.max(0, args.stdout_offset ?? 0))
    const stderr = readLocalAgentOutput(record, "stderr", Math.max(0, args.stderr_offset ?? 0))
    return {
      title: "Agent output",
      metadata: {
        handle: record.handle,
        running: !record.exitedAt,
        exitCode: record.exitCode,
        stdout_next_offset: stdout.nextOffset,
        stderr_next_offset: stderr.nextOffset,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
      },
      output: [
        `${render(record)}`,
        "",
        stdout.truncated ? "STDOUT (older output dropped from buffer):" : "STDOUT:",
        stdout.text || "(none)",
        "",
        stderr.truncated ? "STDERR (older output dropped from buffer):" : "STDERR:",
        stderr.text || "(none)",
      ].join("\n"),
    }
  },
})

export const AgentWaitTool = tool({
  description: "Wait for a local agent spawned by Athena Code to finish and return its captured stdout/stderr. Use for one-shot subagent tasks where the response should be reported back.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
    timeout_ms: tool.schema.number().optional().describe("Maximum time to wait in milliseconds. Defaults to 120000."),
  },
  async execute(args) {
    const record = await waitLocalAgent(args.handle, args.timeout_ms ?? 120000)
    if (!record) return { title: "Agent not found", metadata: { error: true, handle: args.handle }, output: `${args.handle} does not exist.` }
    return {
      title: record.exitedAt ? "Agent completed" : "Agent still running",
      metadata: { handle: record.handle, running: !record.exitedAt, exitCode: record.exitCode, signal: record.signal },
      output: [`${render(record)}`, "", "STDOUT:", record.stdout || "(none)", "", "STDERR:", record.stderr || "(none)"].join("\n"),
    }
  },
})
