// Athena Code TUI plugin: registers the cross-agent session finder
// (/find-sessions), the home-screen hero/command room/footer, and the
// working verb on top of the stock TUI via the builtin plugin API.
// (The upstream session sidebar is removed entirely by the patch, so no
// sidebar slots are registered.)
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "./builtins"
import { DialogAthenaSessions } from "../component/dialog-athena-sessions"
import { AthenaHomeHero } from "../component/athena-home-hero"
import { AthenaDepartureFlight } from "../component/athena-owl"
import { AthenaWorkingVerb } from "../component/athena-working-verb"
import { AthenaCommandRoom } from "./home/athena-command-room"
import { AthenaHomeFooter } from "./home/athena-status"

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
      app() {
        return <AthenaDepartureFlight color={() => api.theme.current.textMuted} />
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
    ],
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
