import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { writeMemoryFact } from "../session/memory/actions"

export const Parameters = Schema.Struct({
  text: Schema.String.annotate({
    description: "A durable Athena Code fact to remember globally across folders. Do not store secrets.",
  }),
})

export const MemoryWriteTool = Tool.define(
  "memory_write",
  Effect.gen(function* () {
    return {
      description:
        "Save a durable global Athena Code memory for future sessions in any folder. Use when the user asks you to remember a stable fact, preference, decision, or workflow note. Do not store secrets.",
      parameters: Parameters,
      execute: (params: { text: string }) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const entry = writeMemoryFact(instance.worktree, params.text, "agent")
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
        }).pipe(Effect.orDie),
    }
  }),
)
