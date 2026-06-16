// Opens a command in a new visible terminal window, detached from the Athena
// Code process, so the user can take over an agent session interactively.
// Emulator choice: $ATHENA_TERMINAL / $TERMINAL override, then the first
// known emulator found on PATH per platform.

import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, delimiter, join } from "node:path"

export type TerminalLaunch = {
  ok: boolean
  terminal?: string
  // PID of the command running inside the visible terminal, when known at
  // launch time. This is intentionally not the emulator launcher PID because
  // common terminals hand work to a server process and then exit.
  pid?: number
  // On Linux the visible command writes its PID here from inside the terminal;
  // callers can read it later if it was not available before this function
  // returned. Undefined on macOS/Windows where closing the window is not yet
  // supported reliably.
  pidFile?: string
  error?: string
}

function onPath(command: string): boolean {
  if (command.includes("/") || command.includes("\\")) return existsSync(command)
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""]
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      if (existsSync(join(dir, command + ext.toLowerCase())) || existsSync(join(dir, command + ext))) return true
    }
  }
  return false
}

// argv for a given emulator running `argv` in `cwd`. Flags follow each
// emulator's convention for "run this command in a fresh window".
function emulatorArgv(emulator: string, argv: string[], cwd: string): string[] {
  switch (basename(emulator)) {
    case "gnome-terminal":
      return [emulator, `--working-directory=${cwd}`, "--", ...argv]
    case "kgx": // GNOME Console
      return [emulator, `--working-directory=${cwd}`, "--", ...argv]
    case "kitty":
      return [emulator, "--directory", cwd, ...argv]
    case "alacritty":
      return [emulator, "--working-directory", cwd, "-e", ...argv]
    case "wezterm":
      return [emulator, "start", "--cwd", cwd, "--", ...argv]
    case "konsole":
      return [emulator, "--workdir", cwd, "-e", ...argv]
    case "xfce4-terminal":
      return [emulator, `--working-directory=${cwd}`, "-x", ...argv]
    case "foot":
      return [emulator, "--working-directory", cwd, ...argv]
    case "tilix":
      return [emulator, `--working-directory=${cwd}`, "-e", ...argv]
    default:
      // Generic `-e command...` convention (xterm, urxvt, st, $TERMINAL...).
      return [emulator, "-e", ...argv]
  }
}

const LINUX_EMULATORS = [
  "gnome-terminal",
  "konsole",
  "kitty",
  "alacritty",
  "wezterm",
  "xfce4-terminal",
  "tilix",
  "kgx",
  "foot",
  "xterm",
]

function shellQuote(token: string): string {
  return `'${token.replace(/'/g, `'\\''`)}'`
}

function withPidCapture(argv: string[], pidFile: string): string[] {
  return ["sh", "-c", 'pidfile=$1; shift; printf "%s\\n" "$$" > "$pidfile"; exec "$@"', "athena-terminal", pidFile, ...argv]
}

function launchDetached(argv: string[], cwd: string, pidFile?: string): TerminalLaunch {
  try {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env: process.env,
      detached: true,
      stdio: "ignore",
    })
    child.on("error", () => {})
    child.unref()
    return { ok: true, terminal: basename(argv[0]!), pidFile }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function openVisibleTerminal(argv: string[], cwd: string): TerminalLaunch {
  if (process.platform === "darwin") {
    const command = `cd ${shellQuote(cwd)} && ${argv.map(shellQuote).join(" ")}`
    const result = spawnSync("osascript", [
      "-e",
      `tell application "Terminal" to do script ${JSON.stringify(command)}`,
      "-e",
      'tell application "Terminal" to activate',
    ])
    if (result.status === 0) return { ok: true, terminal: "Terminal.app" }
    return { ok: false, error: result.stderr?.toString() || "osascript failed" }
  }

  if (process.platform === "win32") {
    if (onPath("wt")) return launchDetached(["wt", "-d", cwd, ...argv], cwd)
    return launchDetached(["cmd", "/c", "start", "", ...argv], cwd)
  }

  const preferred = process.env.ATHENA_TERMINAL?.trim() || process.env.TERMINAL?.trim()
  const candidates = [
    ...(preferred && onPath(preferred) ? [preferred] : []),
    ...LINUX_EMULATORS.filter((emulator) => onPath(emulator)),
  ]
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "No terminal emulator found on PATH (set ATHENA_TERMINAL to your terminal command).",
    }
  }
  const pidFile = join(tmpdir(), `athena-terminal-${randomUUID()}.pid`)
  return launchDetached(emulatorArgv(candidates[0]!, withPidCapture(argv, pidFile), cwd), cwd, pidFile)
}
