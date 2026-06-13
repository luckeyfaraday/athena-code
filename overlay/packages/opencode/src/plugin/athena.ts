import type { Plugin } from "@opencode-ai/plugin"
import { MemoryWriteTool } from "../tool/memory-write"
import { MemoryReadTool } from "../tool/memory-read"
import { SessionRecallTool } from "../tool/session-recall"
import {
  AgentListTool,
  AgentMessageTool,
  AgentOutputTool,
  AgentSpawnTool,
  AgentStopTool,
  AgentTakeoverTool,
  AgentWaitTool,
} from "../tool/agent-local"
import { frozenSnapshotSystem } from "../session/memory/snapshot"
import { recallSystemEntry } from "../session/memory/recall"
import { writeMemoryStatus } from "../session/memory/status"
import { indexSessionMessages, sessionRecallEntry } from "../session/memory/sessionindex"
import { scheduleAgentScan } from "../session/memory/agentscan"
import { permissionlessDefaults } from "./permission-defaults"
import { normalizeWorktree } from "./workspace"

// Athena Code memory layer, wired through the stock plugin hook API so the
// upstream session loop needs no patching:
//
// - the plugin factory runs at server-instance boot, which kicks the
//   cross-agent session scan (and any pending index migration) before the
//   first chat turn so /find-sessions has data on a fresh launch
// - `experimental.chat.messages.transform` fires once per chat step with the
//   full message history: index the session, refresh the scan debounce, and
//   record the recall query for the step's model call
// - `experimental.chat.system.transform` fires inside LLM request prep with
//   the sessionID: inject the frozen snapshot and recall entries recorded by
//   the messages hook
//
// The system hook also fires for small-model calls on the same session (title
// generation, summarize). The per-session query map intentionally stays
// populated for the whole turn rather than being consumed by the first model
// call: a concurrent title-generation call must not steal the injection from
// the main chat call. The extra memory context in those same-session small
// calls is harmless.
export const AthenaPlugin: Plugin = async (input) => {
  const worktree = normalizeWorktree(input)
  scheduleAgentScan()
  const recallQuery = new Map<string, string>()

  return {
    // Athena runs permissionless by default. Upstream's built-in ruleset is
    // already "*": allow; the only "ask" rules are doom_loop,
    // external_directory, and .env reads, so allowing those three removes
    // every prompt. User config keys are appended after ours and the last
    // matching rule wins in Permission.evaluate, so explicit user rules and
    // wildcard/specific ordering still take precedence.
    config: async (cfg) => {
      cfg.permission = permissionlessDefaults(cfg.permission) as typeof cfg.permission
    },
    tool: {
      memory_write: MemoryWriteTool,
      memory_read: MemoryReadTool,
      session_recall: SessionRecallTool,
      agent_spawn: AgentSpawnTool,
      agent_list: AgentListTool,
      agent_message: AgentMessageTool,
      agent_stop: AgentStopTool,
      agent_output: AgentOutputTool,
      agent_wait: AgentWaitTool,
      agent_takeover: AgentTakeoverTool,
    },
    "experimental.chat.messages.transform": async (_input, output) => {
      const msgs = output.messages
      const sessionID = msgs[0]?.info.sessionID
      if (!sessionID) return
      indexSessionMessages(worktree, sessionID, msgs)
      scheduleAgentScan()
      const query = (msgs.findLast((m) => m.info.role === "user")?.parts ?? [])
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
      writeMemoryStatus(worktree, query)
      recallQuery.set(sessionID, query)
    },
    "experimental.chat.system.transform": async (hook, output) => {
      const sessionID = hook.sessionID
      if (!sessionID) return
      const query = recallQuery.get(sessionID)
      if (query === undefined) return
      output.system.push(
        frozenSnapshotSystem(worktree, sessionID, {
          agent: process.env.ATHENA_RUNTIME_BRAND?.trim(),
        }),
      )
      const recall = recallSystemEntry(worktree, query)
      if (recall) output.system.push(recall)
      const sessionRecall = sessionRecallEntry(worktree, query, undefined, sessionID)
      if (sessionRecall) output.system.push(sessionRecall)
    },
  }
}
