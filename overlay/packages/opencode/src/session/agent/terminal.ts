// Opens a command in a new visible terminal window, detached from the Athena
// Code process, so the user can take over an agent session interactively.
// Emulator choice: $ATHENA_TERMINAL / $TERMINAL override, then the first
// known emulator found on PATH per platform.

import { spawn, spawnSync } from "node:child_process"
import { basename, delimiter, join } from "node:path"
import { existsSync } from "node:fs"

export type TerminalLaunch = {
  ok: boolean
  terminal?: string
  // PID of the spawned emulator process. On Linux/BSD it is a process-group
  // leader (detached spawn calls setsid), so killing -pid closes the window
  // and the agent inside it. Undefined on platforms where we can't get a
  // killable handle to the window (macOS Terminal.app via osascript, Windows
  // `start`), in which case the window can't be closed programmatically yet.
  pid?: number
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

function launchDetached(argv: string[], cwd: string): TerminalLaunch {
  try {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env: process.env,
      detached: true,
      stdio: "ignore",
    })
    child.on("error", () => {})
    child.unref()
    return { ok: true, terminal: basename(argv[0]!), pid: child.pid }
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
  return launchDetached(emulatorArgv(candidates[0]!, argv, cwd), cwd)
}
