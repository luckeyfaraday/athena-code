// Athena Code TUI plugin: registers the cross-agent session finder
// (/find-sessions) on top of the stock TUI via the builtin plugin API.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "./builtins"
import { DialogAthenaSessions } from "../component/dialog-athena-sessions"

const id = "internal:athena"

const tui: TuiPlugin = async (api) => {
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
