export type AthenaRuntimeBrand = "ATHENA CODE" | "ATHENA CODEX" | "ATHENA CLAUDE"

export const athenaRuntimeBrand = (process.env.ATHENA_RUNTIME_BRAND?.trim().toUpperCase()
  || "ATHENA CODE") as AthenaRuntimeBrand

export const athenaTerminalPrefix =
  athenaRuntimeBrand === "ATHENA CODEX" ? "ACX" : athenaRuntimeBrand === "ATHENA CLAUDE" ? "ACL" : "AC"

// The prompt's frame: a full thin border with diamond corners, echoing the
// home screen's ── ◆ ── rule, instead of upstream's thick left bar (the
// single most opencode-identifying shape in the TUI). Consumed by the
// branding patch's glyph-swap hunks in component/prompt/index.tsx; the
// border color (agent tint on focus) and panel background stay upstream.
export const athenaPromptFrame = {
  border: ["top" as const, "left" as const, "right" as const, "bottom" as const],
  chars: {
    topLeft: "◆",
    topRight: "◆",
    bottomLeft: "◆",
    bottomRight: "◆",
    horizontal: "─",
    vertical: "│",
    bottomT: "",
    topT: "",
    cross: "",
    leftT: "",
    rightT: "",
  },
}
