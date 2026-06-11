import { tool } from "@opencode-ai/plugin"
import { readSessionRecall } from "../session/memory/sessionindex"

const KNOWN_AGENTS = ["athena", "claude", "codex", "opencode", "hermes"] as const

function renderSessionRecall(
  params: { query: string; agent?: string },
  workspace: string,
  sessionId?: string,
): {
  title: string
  metadata: Record<string, unknown>
  output: string
} {
  const agent = params.agent?.trim().toLowerCase() || undefined
  if (agent && !KNOWN_AGENTS.includes(agent as (typeof KNOWN_AGENTS)[number])) {
    return {
      title: "Unknown recall agent",
      metadata: { error: true, query: params.query.trim(), agent },
      output: `Unknown agent ${JSON.stringify(agent)}. Use one of: ${KNOWN_AGENTS.join(", ")}.`,
    }
  }
  let result: ReturnType<typeof readSessionRecall>
  try {
    result = readSessionRecall(workspace, params.query, undefined, sessionId, agent)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      title: "Session recall unavailable",
      metadata: { error: true, query: params.query.trim() },
      output: `Athena Code could not read the session index: ${detail}`,
    }
  }
  if (result.empty_index) {
    return {
      title: "Session recall empty",
      metadata: { empty_index: true, count: 0, query: result.query },
      output: "Athena Code session recall is empty. No prior session turns have been indexed yet.",
    }
  }
  if (!result.query) {
    return {
      title: "No recall query",
      metadata: { empty_index: false, count: 0, query: result.query },
      output: "Provide a non-empty query to search Athena Code session recall.",
    }
  }
  if (result.hits.length === 0) {
    const scope = agent ? ` in ${agent} sessions` : ""
    return {
      title: "No session recall match",
      metadata: { empty_index: false, count: 0, query: result.query, agent },
      output: `No session recall matched ${JSON.stringify(result.query)}${scope}.`,
    }
  }
  return {
    title: "Session recall",
    metadata: { empty_index: false, count: result.hits.length, query: result.query, agent },
    output: result.hits
      .map((hit) => `- [${hit.agent} ${hit.session_id} ${hit.workspace} ${hit.role} ${hit.ts}] ${hit.text}`)
      .join("\n"),
  }
}

export const SessionRecallTool = tool({
  description:
    "Search prior coding sessions across all local agents (Athena Code, Claude Code, Codex, opencode, Hermes) and all workspaces. Use when the user asks what was discussed before, references another session or agent, or asks to recover prior work.",
  args: {
    query: tool.schema
      .string()
      .describe("Search text for prior session recall. Use specific keywords from the past discussion."),
    agent: tool.schema
      .string()
      .optional()
      .describe(
        'Optional filter to one agent\'s sessions: "athena", "claude", "codex", "opencode", or "hermes". Omit to search all agents.',
      ),
  },
  async execute(args, context) {
    return renderSessionRecall(args, context.worktree, context.sessionID)
  },
})
