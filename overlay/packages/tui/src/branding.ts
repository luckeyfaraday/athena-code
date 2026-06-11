export type AthenaRuntimeBrand = "ATHENA CODE" | "ATHENA CODEX" | "ATHENA CLAUDE"

export const athenaRuntimeBrand = (process.env.ATHENA_RUNTIME_BRAND?.trim().toUpperCase()
  || "ATHENA CODE") as AthenaRuntimeBrand

export const athenaTerminalPrefix =
  athenaRuntimeBrand === "ATHENA CODEX" ? "ACX" : athenaRuntimeBrand === "ATHENA CLAUDE" ? "ACL" : "AC"

// The prompt is a frameless band: just the brand's deep-green panel
// (theme backgroundElement) around the input, with no border drawn around
// it — neither upstream's thick left bar nor a thin outline. Consumed by
// the branding patch's hunks in component/prompt/index.tsx; an empty sides
// array makes opentui draw no border and reserve no rows/columns for one,
// so the band runs the full width of the prompt area. chars is kept for
// the patch's customBorderChars prop but is inert with no sides enabled.
export const athenaPromptFrame = {
  border: [] as ("top" | "left" | "right" | "bottom")[],
  chars: {
    topLeft: "",
    topRight: "",
    bottomLeft: "",
    bottomRight: "",
    horizontal: "",
    vertical: "",
    bottomT: "",
    topT: "",
    cross: "",
    leftT: "",
    rightT: "",
  },
}
