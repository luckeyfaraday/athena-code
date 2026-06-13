import { Effect, Layer } from "effect"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import type { Interface, Method, Service, UpgradeFailedError } from "@/installation"
import { detectInstallMethod, fetchLatestVersion, runInstaller } from "./athena-release"

// Drop-in implementation of the upstream Installation service that targets
// Athena Code's own GitHub releases. The Service tag and error class are
// passed in by installation/index.ts rather than imported, which keeps this
// module out of an import cycle with it.
export function makeAthenaInstallationLayer(deps: {
  Service: typeof Service
  UpgradeFailedError: typeof UpgradeFailedError
}): Layer.Layer<Service> {
  const userAgent = `athena-code/${InstallationChannel}/${InstallationVersion}`

  const latest = Effect.fn("Installation.latest")(function* (_method?: Method) {
    return yield* Effect.promise(() => fetchLatestVersion(userAgent))
  })

  const service: Interface = {
    info: Effect.fn("Installation.info")(function* () {
      return { version: InstallationVersion, latest: yield* latest() }
    }),
    method: () => Effect.sync(() => detectInstallMethod()),
    latest,
    upgrade: Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
      if (m !== "curl") {
        return yield* new deps.UpgradeFailedError({ stderr: `Unknown installation method: ${m}` })
      }
      const result = yield* Effect.promise(() =>
        runInstaller(target, userAgent).catch((cause) => ({
          code: 1,
          stderr: cause instanceof Error ? cause.message : String(cause),
        })),
      )
      if (result.code !== 0) {
        return yield* new deps.UpgradeFailedError({
          stderr: result.stderr.trim() || `installer exited with code ${result.code}`,
        })
      }
    }),
  }

  return Layer.succeed(deps.Service, deps.Service.of(service))
}
