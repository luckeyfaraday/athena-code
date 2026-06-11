import { createMemo, createSignal, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import {
  AGENT_KINDS,
  formatAgentSummary,
  listAthenaAgents,
  parseSpawnFilter,
  sendAthenaAgentMessage,
  spawnAthenaAgent,
  stopAthenaAgent,
  type AthenaAgentKind,
  type AthenaManagedAgent,
} from "../util/athena-agents"

function outputPreview(output: string): string {
  const line = output
    .trim()
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1)
  return line ? (line.length > 100 ? line.slice(0, 99) + "…" : line) : "no output yet"
}

export function DialogSpawnAthenaAgent(props: { workspace: string }) {
  const dialog = useDialog()
  const toast = useToast()
  const [filter, setFilter] = createSignal("")
  const parsed = createMemo(() => parseSpawnFilter(filter()))
  const task = createMemo(() => parsed().task)

  const options = createMemo((): DialogSelectOption<AthenaAgentKind>[] => {
    const selected = parsed().kind
    const kinds = selected ? [selected] : [...AGENT_KINDS]
    return kinds.map((kind) => ({
      title: `Spawn ${kind}`,
      value: kind,
      category: "local agent",
      footer: task() || `Type a task, or start with "${kind} ..."`,
    }))
  })

  onMount(() => dialog.setSize("large"))

  return (
    <DialogSelect
      title="Spawn local agent"
      options={options()}
      skipFilter={true}
      onFilter={setFilter}
      onSelect={(option) => {
        try {
          const agent = spawnAthenaAgent({ kind: option.value, workspace: props.workspace, task: task() })
          dialog.clear()
          toast.show({ title: `Spawned ${agent.handle}`, message: agent.argv.join(" ") })
        } catch (error) {
          toast.show({ variant: "error", title: "Failed to spawn agent", message: String(error) })
        }
      }}
    />
  )
}

export function DialogAthenaAgents() {
  const dialog = useDialog()
  const toast = useToast()
  const [refresh, setRefresh] = createSignal(0)
  const agents = createMemo(() => {
    refresh()
    return listAthenaAgents()
  })
  const options = createMemo((): DialogSelectOption<AthenaManagedAgent>[] => {
    const list = agents()
    if (list.length === 0) {
      return [{ title: "No local agents spawned yet", value: undefined as unknown as AthenaManagedAgent }]
    }
    return list.map((agent) => ({
      title: formatAgentSummary(agent),
      value: agent,
      category: agent.workspace,
      footer: outputPreview(agent.output),
    }))
  })

  onMount(() => dialog.setSize("large"))

  return (
    <DialogSelect
      title="Local agents"
      options={options()}
      skipFilter={true}
      onFilter={() => setRefresh((value) => value + 1)}
      onSelect={(option) => {
        if (!option.value) return
        try {
          const agent = stopAthenaAgent(option.value.handle)
          toast.show({ title: `Stopped ${agent.handle}`, message: outputPreview(agent.output) })
          setRefresh((value) => value + 1)
        } catch (error) {
          toast.show({ variant: "error", title: "Failed to stop agent", message: String(error) })
        }
      }}
    />
  )
}

export function DialogTellAthenaAgent() {
  const dialog = useDialog()
  const toast = useToast()
  const [message, setMessage] = createSignal("")
  const agents = createMemo(() => listAthenaAgents().filter((agent) => agent.status === "running"))
  const options = createMemo((): DialogSelectOption<AthenaManagedAgent>[] => {
    const list = agents()
    if (list.length === 0) {
      return [{ title: "No running local agents", value: undefined as unknown as AthenaManagedAgent }]
    }
    return list.map((agent) => ({
      title: agent.handle,
      value: agent,
      category: agent.workspace,
      footer: message() || "Type the message, then select the target",
    }))
  })

  onMount(() => dialog.setSize("large"))

  return (
    <DialogSelect
      title="Tell local agent"
      options={options()}
      skipFilter={true}
      onFilter={setMessage}
      onSelect={(option) => {
        if (!option.value) return
        try {
          const agent = sendAthenaAgentMessage(option.value.handle, message())
          dialog.clear()
          toast.show({ title: `Sent to ${agent.handle}` })
        } catch (error) {
          toast.show({ variant: "error", title: "Failed to message agent", message: String(error) })
        }
      }}
    />
  )
}
