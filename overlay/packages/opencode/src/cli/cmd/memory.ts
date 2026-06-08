import { cmd } from "@/cli/cmd/cmd"
import { addMemory, listMemory, resolveMemoryWorkspace } from "@/session/memory/actions"

export const MemoryAddCommand = cmd({
  command: "add <text>",
  describe: "add a global Athena Code memory",
  builder: (yargs) =>
    yargs.positional("text", {
      type: "string",
      describe: "memory text to save",
      demandOption: true,
    }),
  handler: (args) => {
    const text = String(args.text ?? "")
    const entry = addMemory(resolveMemoryWorkspace(), text)
    if (!entry) {
      console.log("Memory unchanged: empty or duplicate.")
      return
    }
    console.log(`Saved memory ${entry.id}`)
  },
})

export const MemoryListCommand = cmd({
  command: "list",
  describe: "list global Athena Code memories",
  handler: () => {
    const entries = listMemory(resolveMemoryWorkspace())
    if (entries.length === 0) {
      console.log("No Athena memories found.")
      return
    }
    for (const entry of entries) {
      console.log(`${entry.id} ${entry.created_at} ${entry.source}`)
      console.log(entry.text)
      console.log("")
    }
  },
})

export const MemoryCommand = cmd({
  command: "memory",
  describe: "manage global Athena Code memories",
  builder: (yargs) => yargs.command(MemoryAddCommand).command(MemoryListCommand).demandCommand(),
  handler: () => {},
})
