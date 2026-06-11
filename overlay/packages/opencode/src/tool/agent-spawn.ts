import { tool } from "@opencode-ai/plugin"
import { normalizeWorktree } from "../plugin/workspace"
import {
  LOCAL_AGENT_KINDS,
  formatLocalAgentSummary,
  listLocalAgents,
  parseLocalAgentKind,
  sendLocalAgentMessage,
  spawnLocalAgent,
  stopLocalAgent,
} from "../session/agents/local"

function renderAgents() {
  const agents = listLocalAgents()
  if (agents.length === 0) return "No local agents are currently spawned in this Athena Code process."
  return agents.map(formatLocalAgentSummary).join("\n")
}

export const AgentSpawnTool = tool({
  description:
    'Spawn a local coding agent subprocess from the user\'s prompt. Use when the user asks to spawn, start, delegate to, or hand work to Claude Code, Codex, OpenCode, or Hermes. Do not use slash commands for spawning.',
  args: {
    agent: tool.schema
      .string()
      .describe('Agent to spawn. Must be one of: "claude", "codex", "opencode", or "hermes".'),
    task: tool.schema.string().describe("Task prompt to pass to the spawned agent."),
    workspace: tool.schema
      .string()
      .optional()
      .describe("Workspace directory. Omit to use the current Athena Code workspace."),
  },
  async execute(args, context) {
    const kind = parseLocalAgentKind(args.agent)
    if (!kind) {
      return {
        title: "Unknown agent",
        metadata: { error: true, agent: args.agent },
        output: `Unknown agent ${JSON.stringify(args.agent)}. Use one of: ${LOCAL_AGENT_KINDS.join(", ")}.`,
      }
    }
    const agent = spawnLocalAgent({ kind, workspace: args.workspace || normalizeWorktree(context), task: args.task })
    return {
      title: `Spawned ${agent.handle}`,
      metadata: { handle: agent.handle, kind: agent.kind, pid: agent.pid, argv: agent.argv, workspace: agent.workspace },
      output: `${formatLocalAgentSummary(agent)}\nCommand: ${agent.argv.join(" ")}`,
    }
  },
})

export const AgentListTool = tool({
  description:
    "List local coding agents spawned by this Athena Code process. Use when the user asks which agents are spawned, running, active, or available to message.",
  args: {},
  async execute() {
    return {
      title: "Local agents",
      metadata: { count: listLocalAgents().length },
      output: renderAgents(),
    }
  },
})

export const AgentMessageTool = tool({
  description:
    "Send a follow-up instruction to a running local agent spawned by Athena Code. Use when the user says to tell, ask, or instruct a specific handle like claude#1 or codex#1.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
    text: tool.schema.string().describe("Message to send to the agent over stdin."),
  },
  async execute(args) {
    try {
      const agent = sendLocalAgentMessage(args.handle, args.text)
      return {
        title: `Sent to ${agent.handle}`,
        metadata: { handle: agent.handle },
        output: `Sent message to ${agent.handle}.`,
      }
    } catch (error) {
      return {
        title: "Agent message failed",
        metadata: { error: true, handle: args.handle },
        output: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

export const AgentStopTool = tool({
  description:
    "Stop a running local agent spawned by Athena Code. Use when the user asks to stop, kill, or terminate a specific spawned agent handle.",
  args: {
    handle: tool.schema.string().describe('Agent handle, for example "claude#1" or "codex#1".'),
  },
  async execute(args) {
    try {
      const agent = stopLocalAgent(args.handle)
      return {
        title: `Stopped ${agent.handle}`,
        metadata: { handle: agent.handle, status: agent.status },
        output: formatLocalAgentSummary(agent),
      }
    } catch (error) {
      return {
        title: "Agent stop failed",
        metadata: { error: true, handle: args.handle },
        output: error instanceof Error ? error.message : String(error),
      }
    }
  },
})
