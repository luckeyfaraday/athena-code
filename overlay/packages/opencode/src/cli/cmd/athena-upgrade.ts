import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "@/installation"
import { RELEASES_URL } from "@/installation/athena-release"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

// Athena Code's self-upgrade. Mirrors the upstream OpenCode command, but the
// Installation service is wired to Athena Code's own releases (see
// installation/athena.ts). The install scripts are the only supported
// distribution channel, so there is no --method option: anything outside the
// standard install locations needs explicit confirmation before a curl-style
// install is forced.
export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade athena code to the latest or a specific version",
  builder: (yargs: Argv) => {
    return yargs.positional("target", {
      describe: "version to upgrade to, for ex '0.2.1' or 'v0.2.1'",
      type: "string",
    })
  },
  handler: async (args: { target?: string }) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    let method = await Installation.method()
    if (method === "unknown") {
      prompts.log.warn(`athena-code runs from ${process.execPath}, which is not a standard install location`)
      const install = await prompts.select({
        message: "Install to the standard location anyway?",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
        initialValue: false,
      })
      if (install !== true) {
        prompts.outro("Done")
        return
      }
      method = "curl"
    }
    const target = args.target ? args.target.replace(/^v/, "") : await Installation.latest(method)

    if (InstallationVersion === target) {
      prompts.log.warn(`athena-code upgrade skipped: ${target} is already installed`)
      prompts.outro("Done")
      return
    }

    prompts.log.info(`From ${InstallationVersion} → ${target}`)
    const spinner = prompts.spinner()
    spinner.start("Upgrading...")
    const err = await Installation.upgrade(method, target).catch((err) => err)
    if (err) {
      spinner.stop("Upgrade failed", 1)
      if (err instanceof Installation.UpgradeFailedError) prompts.log.error(err.stderr)
      else if (err instanceof Error) prompts.log.error(err.message)
      prompts.log.info(`Releases: ${RELEASES_URL}`)
      prompts.outro("Done")
      return
    }
    spinner.stop("Upgrade complete")
    prompts.outro("Done")
  },
}
