import path from "path"
import os from "os"
import fs from "fs/promises"
import { spawn } from "child_process"

// Athena Code publishes releases on GitHub and is installed exclusively by the
// repository's install scripts, so the in-app updater works against that
// repository instead of the package managers the upstream OpenCode updater
// probes for.
export const REPOSITORY = "luckeyfaraday/athena-code"
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const INSTALL_SCRIPT_BASE = `https://raw.githubusercontent.com/${REPOSITORY}/main/scripts`

export interface InstallerResult {
  code: number
  stderr: string
}

// Releases are tagged vX.Y.Z while binaries report X.Y.Z, matching the
// upstream convention of handling versions without the leading v.
export function parseLatestVersion(body: string): string {
  const release = JSON.parse(body) as { tag_name?: unknown }
  if (typeof release.tag_name !== "string" || release.tag_name === "") {
    throw new Error(`latest release of ${REPOSITORY} has no tag_name`)
  }
  return release.tag_name.replace(/^v/, "")
}

// Only installs made by the install scripts are upgraded in place; a dev build
// or a manually copied binary reports "unknown" so the updater never replaces
// a binary it does not manage. The upstream package-manager probes are
// intentionally not inherited: they look for globally installed "opencode"
// packages and would upgrade a coexisting stock OpenCode instead of this
// build.
export function detectInstallMethod(
  execPath: string = process.execPath,
  platform: string = process.platform,
): "curl" | "unknown" {
  if (platform === "win32") {
    return execPath.toLowerCase().includes("\\athenacode\\") ? "curl" : "unknown"
  }
  if (execPath.includes(path.join(".local", "share", "athena-code"))) return "curl"
  if (execPath.endsWith(path.join(".local", "bin", "athena-code"))) return "curl"
  return "unknown"
}

async function fetchText(url: string, accept: string, userAgent: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept, "user-agent": userAgent },
  })
  if (!response.ok) throw new Error(`GET ${url} failed with status ${response.status}`)
  return response.text()
}

export async function fetchLatestVersion(userAgent: string): Promise<string> {
  return parseLatestVersion(await fetchText(LATEST_RELEASE_API, "application/vnd.github+json", userAgent))
}

function run(command: string, args: string[], stdin?: string): Promise<InstallerResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: [stdin === undefined ? "ignore" : "pipe", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (cause) => resolve({ code: 1, stderr: cause.message }))
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }))
    if (stdin !== undefined) {
      child.stdin?.write(stdin)
      child.stdin?.end()
    }
  })
}

// Runs the platform install script for the requested version. The scripts
// download from GitHub releases and verify the published SHA-256 checksum, so
// the in-app update inherits the same integrity check as a manual install.
export async function runInstaller(version: string, userAgent: string): Promise<InstallerResult> {
  const tag = `v${version.replace(/^v/, "")}`
  if (process.platform === "win32") {
    const script = await fetchText(`${INSTALL_SCRIPT_BASE}/install.ps1`, "text/plain", userAgent)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "athena-code-upgrade-"))
    try {
      const file = path.join(dir, "install.ps1")
      await fs.writeFile(file, script)
      return await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, "-Version", tag])
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
  const script = await fetchText(`${INSTALL_SCRIPT_BASE}/install.sh`, "text/plain", userAgent)
  return run("bash", ["-s", "--", "--version", tag], script)
}
