export type AthenaRuntimeBrand = "ATHENA CODE" | "ATHENA CODEX" | "ATHENA CLAUDE"

export const athenaRuntimeBrand = (process.env.ATHENA_RUNTIME_BRAND?.trim().toUpperCase()
  || "ATHENA CODE") as AthenaRuntimeBrand

export const athenaTerminalPrefix =
  athenaRuntimeBrand === "ATHENA CODEX" ? "ACX" : athenaRuntimeBrand === "ATHENA CLAUDE" ? "ACL" : "AC"

// Terminal-log prompt: no box around the input — just a single horizontal
// rule above it (top border only) separating the compose field from the
// transcript, with a flat field below. Consumed by the branding patch's hunks
// in component/prompt/index.tsx (border + customBorderChars props); only the
// horizontal char matters with just the top side enabled.
export const athenaPromptFrame = {
  border: ["top"] as ("top" | "left" | "right" | "bottom")[],
  chars: {
    topLeft: "",
    topRight: "",
    bottomLeft: "",
    bottomRight: "",
    horizontal: "─",
    vertical: "",
    bottomT: "",
    topT: "",
    cross: "",
    leftT: "",
    rightT: "",
  },
}
