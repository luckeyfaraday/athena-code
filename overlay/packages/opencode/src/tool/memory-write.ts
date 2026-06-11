import { tool } from "@opencode-ai/plugin"
import { writeMemoryFact } from "../session/memory/actions"

export const MemoryWriteTool = tool({
  description:
    "Save a durable global Athena Code memory for future sessions in any folder. Use when the user asks you to remember a stable fact, preference, decision, or workflow note. Do not store secrets.",
  args: {
    text: tool.schema
      .string()
      .describe("A durable Athena Code fact to remember globally across folders. Do not store secrets."),
  },
  async execute(args, context) {
    const entry = writeMemoryFact(context.worktree, args.text, "agent")
    if (!entry) {
      return {
        title: "Memory unchanged",
        metadata: { written: false },
        output: "No memory was written because the text was empty or already exists.",
      }
    }
    return {
      title: "Memory saved",
      metadata: { written: true, id: entry.id },
      output: `Saved memory ${entry.id}. It will be available to future Athena Code sessions in any folder.`,
    }
  },
})
