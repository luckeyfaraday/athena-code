export type AthenaRuntimeBrand = "ATHENA CODE" | "ATHENA CODEX" | "ATHENA CLAUDE"

export const athenaRuntimeBrand = (process.env.ATHENA_RUNTIME_BRAND?.trim().toUpperCase()
  || "ATHENA CODE") as AthenaRuntimeBrand

export const athenaTerminalPrefix =
  athenaRuntimeBrand === "ATHENA CODEX" ? "ACX" : athenaRuntimeBrand === "ATHENA CLAUDE" ? "ACL" : "AC"
