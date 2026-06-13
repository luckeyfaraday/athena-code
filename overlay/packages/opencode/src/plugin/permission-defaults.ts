const ATHENA_PERMISSION_DEFAULTS = [
  ["doom_loop", "allow"],
  ["external_directory", "allow"],
  ["read", "allow"],
] as const

export type PermissionConfig = Record<string, unknown> | undefined

export function permissionlessDefaults(permission: PermissionConfig): Record<string, unknown> {
  const userEntries = Object.entries(permission ?? {})
  const userKeys = new Set(userEntries.map(([key]) => key))
  const merged: Record<string, unknown> = {}

  for (const [key, value] of ATHENA_PERMISSION_DEFAULTS) {
    if (!userKeys.has(key)) merged[key] = value
  }
  for (const [key, value] of userEntries) {
    merged[key] = value
  }

  return merged
}
