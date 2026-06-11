import type { Argv } from "yargs"
import { UI } from "../ui"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

// Athena Code ships its own releases; the inherited OpenCode self-upgrade
// would install stock OpenCode over this build, so the command prints the
// Athena Code upgrade instructions instead.
export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "how to upgrade athena code",
  builder: (yargs: Argv) => {
    return yargs.positional("target", {
      describe: "version to upgrade to, for ex '0.2.1' or 'v0.2.1'",
      type: "string",
    })
  },
  handler: async (args: { target?: string }) => {
    const versionArgs = args.target ? ` -s -- --version v${args.target.replace(/^v/, "")}` : ""
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    UI.println(`Athena Code ${InstallationVersion} does not self-update from OpenCode releases.`)
    UI.empty()
    UI.println("Upgrade with the Athena Code installer:")
    UI.println(
      `  Linux/macOS: curl -fsSL https://raw.githubusercontent.com/luckeyfaraday/athena-code/main/scripts/install.sh | bash${versionArgs}`,
    )
    UI.println("  Windows:     irm https://raw.githubusercontent.com/luckeyfaraday/athena-code/main/scripts/install.ps1 | iex")
    UI.empty()
    UI.println("Releases: https://github.com/luckeyfaraday/athena-code/releases")
  },
}
