import { tool } from "@opencode-ai/plugin"
import { readMemoryFacts } from "../session/memory/actions"
import { normalizeWorktree } from "../plugin/workspace"

function renderMemoryRead(params: { query: string }, workspace: string): {
  title: string
  metadata: Record<string, unknown>
  output: string
} {
  const result = readMemoryFacts(workspace, params.query)
  if (result.empty_store) {
    return {
      title: "Memory empty",
      metadata: { empty_store: true, count: 0, total: 0, query: result.query },
      output: "Athena Code memory is empty. No memories are stored in the global .athena-code memory store.",
    }
  }
  if (result.entries.length === 0) {
    return {
      title: "No matching memory",
      metadata: { empty_store: false, count: 0, total: result.total, query: result.query },
      output: `No Athena Code memories matched ${JSON.stringify(result.query)}. ${result.total} memories are stored.`,
    }
  }
  const lines = result.entries.map((entry) => `- ${entry.text}`)
  return {
    title: "Memory read",
    metadata: { empty_store: false, count: result.entries.length, total: result.total, query: result.query },
    output: lines.join("\n"),
  }
}

export const MemoryReadTool = tool({
  description:
    "Read global Athena Code memory from the native .athena-code store. Use when the user asks what you remember, asks you to check memory, or when automatic recall may have missed relevant memory.",
  args: {
    query: tool.schema
      .string()
      .describe(
        "Search text for Athena Code memory. Use an empty string to list recent memories. Do not search for secrets.",
      ),
  },
  async execute(args, context) {
    return renderMemoryRead(args, normalizeWorktree(context))
  },
})
