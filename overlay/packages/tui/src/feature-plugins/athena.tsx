// Athena Code TUI plugin: registers the cross-agent session finder
// (/find-sessions), the home-screen hero/command room/footer, the session
// sidebar title/footer, and the working verb on top of the stock TUI via
// the builtin plugin API.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "./builtins"
import {
  DialogAthenaAgents,
  DialogSpawnAthenaAgent,
  DialogTellAthenaAgent,
} from "../component/dialog-athena-agents"
import { DialogAthenaSessions } from "../component/dialog-athena-sessions"
import { AthenaHomeHero } from "../component/athena-home-hero"
import { AthenaWorkingVerb } from "../component/athena-working-verb"
import { AthenaCommandRoom } from "./home/athena-command-room"
import { AthenaHomeFooter } from "./home/athena-status"
import { AthenaSidebarFooter, AthenaSidebarTitle } from "./sidebar/athena-sidebar"

const id = "internal:athena"

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    // Order 50: below the prompt but above the upstream tips widget for
    // home_bottom (append mode), and the single_winner over the upstream
    // home footer (order 100) for home_footer.
    order: 50,
    slots: {
      home_logo() {
        return <AthenaHomeHero />
      },
      home_bottom() {
        return <AthenaCommandRoom api={api} />
      },
      home_footer() {
        return <AthenaHomeFooter api={api} />
      },
      session_prompt_right(_ctx, props) {
        return <AthenaWorkingVerb api={api} sessionID={props.session_id} />
      },
      sidebar_title(_ctx, props) {
        return (
          <AthenaSidebarTitle api={api} sessionID={props.session_id} title={props.title} shareUrl={props.share_url} />
        )
      },
      sidebar_footer(_ctx, props) {
        return <AthenaSidebarFooter api={api} sessionID={props.session_id} />
      },
    },
  })
  api.keymap.registerLayer({
    priority: 1000,
    commands: [
      {
        name: "session.find_cross_agent",
        title: "Find sessions across agents",
        category: "Session",
        namespace: "palette",
        slashName: "find-sessions",
        slashAliases: ["find", "recall"],
        run() {
          api.ui.dialog.replace(() => <DialogAthenaSessions />)
        },
      },
      {
        name: "agent.spawn_local",
        title: "Spawn local agent",
        category: "Agent",
        namespace: "palette",
        slashName: "spawn-agent",
        slashAliases: ["spawn"],
        run() {
          api.ui.dialog.replace(() => <DialogSpawnAthenaAgent workspace={api.state.path.directory || process.cwd()} />)
        },
      },
      {
        name: "agent.list_local",
        title: "List local agents",
        category: "Agent",
        namespace: "palette",
        slashName: "agents",
        run() {
          api.ui.dialog.replace(() => <DialogAthenaAgents />)
        },
      },
      {
        name: "agent.tell_local",
        title: "Tell local agent",
        category: "Agent",
        namespace: "palette",
        slashName: "tell-agent",
        slashAliases: ["tell"],
        run() {
          api.ui.dialog.replace(() => <DialogTellAthenaAgent />)
        },
      },
    ],
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
