// Plan a takeover of a past session found via session_recall (or /find-sessions):
// the session_takeover tool turns a recalled { agent, session_id } into either an
// in-app handover (suspend this pane and resume the session in place via the
// athena.agent.takeover event the TUI already listens for) or a new visible
// terminal. Unlike agent_takeover, no live spawned-agent handle is required.
//
// Kept as a pure, side-effect-free planner so the validation and resume-command
// logic is unit-testable without the plugin/bus glue: the tool wrapper in
// tool/agent-local.ts performs the GlobalBus.emit / openVisibleTerminal.

import { localAgentResumeCommand, type LocalAgentKind } from "./local"
import { indexedSessionWorkspace } from "../memory/sessionindex"

// Every agent the cross-agent index can hold: athena's own sessions plus the
// four spawnable agents. A superset of LocalAgentKind because athena sessions
// are resumable here even though they are never spawned as subprocess agents.
const TAKEOVER_AGENTS = ["athena", "claude", "codex", "opencode", "hermes"] as const
export type TakeoverAgent = (typeof TAKEOVER_AGENTS)[number]

function isTakeoverAgent(value: string): value is TakeoverAgent {
  return (TAKEOVER_AGENTS as readonly string[]).includes(value)
}

// Native resume invocation for any indexed session, mirroring the TUI's
// resumeCommand table (packages/tui/src/util/athena-sessions.ts). athena's own
// sessions resume through this very binary; localAgentResumeCommand omits them
// because they are not spawnable subprocess agents.
function takeoverResumeCommand(
  agent: TakeoverAgent,
  sessionId: string,
  workspace: string,
): { command: string; args: string[] } {
  if (agent === "athena") return { command: process.execPath, args: [workspace, "--session", sessionId] }
  return localAgentResumeCommand(agent, sessionId, workspace)
}

export type SessionTakeoverPlan =
  | { status: "unknown-agent"; agent: string }
  | { status: "not-found"; agent: TakeoverAgent; sessionId: string }
  | { status: "in_app"; agent: TakeoverAgent; sessionId: string; workspace: string }
  | { status: "terminal"; agent: TakeoverAgent; sessionId: string; workspace: string; command: string; args: string[] }

// Resolve a recalled session into a takeover plan. The session id is validated
// against the cross-agent index (a stale id yields "not-found" rather than a
// silently dropped handover), and its recorded workspace is used when the caller
// does not override it, so the session resumes in its own repo.
export function planSessionTakeover(params: {
  agent: string
  sessionId: string
  workspace?: string
  where?: "in_app" | "terminal"
}): SessionTakeoverPlan {
  const agent = params.agent.trim().toLowerCase()
  if (!isTakeoverAgent(agent)) return { status: "unknown-agent", agent }
  const sessionId = params.sessionId.trim()
  const indexedWorkspace = indexedSessionWorkspace(agent, sessionId)
  if (indexedWorkspace === null) return { status: "not-found", agent, sessionId }
  const workspace = params.workspace?.trim() || indexedWorkspace
  if (params.where === "terminal") {
    return { status: "terminal", agent, sessionId, workspace, ...takeoverResumeCommand(agent, sessionId, workspace) }
  }
  return { status: "in_app", agent, sessionId, workspace }
}
