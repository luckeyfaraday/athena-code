// Athena Code pins its upstream OpenCode revision and publishes its own
// releases. The inherited auto-update check compares this build's version
// against upstream OpenCode releases, producing misleading "update available"
// notifications and upgrades that would replace Athena Code with stock
// OpenCode, so it is disabled. `athena-code upgrade` prints instructions for
// updating from the Athena Code releases instead.
export async function upgrade() {}
