import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { readSessionRecall } from "../session/memory/sessionindex"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search text for prior Athena Code session recall. Use specific keywords from the past discussion.",
  }),
})

function renderSessionRecall(params: { query: string }, workspace: string, sessionId?: string): {
  title: string
  metadata: Record<string, unknown>
  output: string
} {
  let result: ReturnType<typeof readSessionRecall>
  try {
    result = readSessionRecall(workspace, params.query, undefined, sessionId)
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
      output: "Athena Code session recall is empty for this workspace. No prior session turns have been indexed yet.",
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
    return {
      title: "No session recall match",
      metadata: { empty_index: false, count: 0, query: result.query },
      output: `No Athena Code session recall matched ${JSON.stringify(result.query)}.`,
    }
  }
  return {
    title: "Session recall",
    metadata: { empty_index: false, count: result.hits.length, query: result.query },
    output: result.hits
      .map((hit) => `- [${hit.session_id} ${hit.workspace} ${hit.role} ${hit.ts}] ${hit.text}`)
      .join("\n"),
  }
}

export const SessionRecallTool = Tool.define(
  "session_recall",
  Effect.gen(function* () {
    return {
      description:
        "Search prior Athena Code session turns across all workspaces. Use when the user asks what was discussed before, references another session, or asks to recover prior work.",
      parameters: Parameters,
      execute: (params: { query: string }, context: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          return renderSessionRecall(params, instance.worktree, context.sessionID)
        }),
    }
  }),
)
