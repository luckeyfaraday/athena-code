// Athena command console — replaces upstream's centered "Commands" modal.
//
// The home screen and transcript are a terminal command-log (gold sigils, no
// boxes, lowercase section labels); the old palette teleported the user into a
// generic centered, scrim-backed fuzzy-list modal. This renders the same
// command set as an *anchored console*: flush to the bottom (rising from the
// prompt), no dimming scrim, a gold `AC ›` sigil header, commands grouped by
// Athena *intent* (recall · steer · weave · workspace · system) instead of
// opencode's raw categories, and a gold caret marking the selection rather than
// a filled primary block. It is still wired through `command.palette.show` and
// still dispatches the exact same commands — only the surface changed.
//
// Anchoring + no-scrim come from the Dialog container (ui/dialog.tsx anchor /
// scrim options), requested on mount; the list mechanics (fuzzy filter,
// keyboard nav, scroll) mirror ui/dialog-select.tsx so behaviour stays familiar.

import { RGBA, TextAttributes, type ScrollBoxRenderable, type InputRenderable } from "@opentui/core"
import { createEffect, createMemo, For, on, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTerminalDimensions } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { entries, groupBy, pipe } from "remeda"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useTuiConfig } from "../config"
import { athenaTerminalPrefix } from "../branding"
import {
  COMMAND_PALETTE_COMMAND,
  formatKeyBindings,
  type OpenTuiKeymap,
  useBindings,
  useKeymapSelector,
  useOpencodeKeymap,
} from "../keymap"

type PaletteCommandEntry = ReturnType<OpenTuiKeymap["getCommandEntries"]>[number]

function isVisiblePaletteCommand(command: PaletteCommandEntry["command"]) {
  return command.hidden !== true && command.name !== COMMAND_PALETTE_COMMAND
}

// Athena intents, ordered top-to-bottom. Recall (sessions, memory, search) leads
// because cross-session memory is what makes Athena Athena; system trails as the
// catch-all. Each upstream command category maps to one intent; anything
// unmapped falls through to "system".
const INTENT_ORDER = ["recall", "steer", "weave", "workspace", "system"] as const
type Intent = (typeof INTENT_ORDER)[number]

const INTENT_BY_CATEGORY: Record<string, Intent> = {
  Session: "recall",
  Memory: "recall",
  Agent: "steer",
  Model: "steer",
  model: "steer",
  mode: "steer",
  thought_level: "steer",
  Provider: "steer",
  Providers: "steer",
  "Popular providers": "steer",
  Prompt: "weave",
  Skills: "weave",
  Workspace: "workspace",
  "Choose workspace": "workspace",
  "New workspace": "workspace",
  VCS: "workspace",
  System: "system",
  Debug: "system",
}

function intentFor(category: string | undefined): Intent {
  if (category && category in INTENT_BY_CATEGORY) return INTENT_BY_CATEGORY[category]
  return "system"
}

const INTENT_RANK = new Map<Intent, number>(INTENT_ORDER.map((intent, index) => [intent, index]))

type ConsoleOption = {
  title: string
  description?: string
  footer?: string
  value: string
  intent: Intent
  run: () => void
}

const TRANSPARENT = RGBA.fromInts(0, 0, 0, 0)

export function CommandPaletteDialog() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const config = useTuiConfig()
  const keymap = useOpencodeKeymap()
  const dimensions = useTerminalDimensions()

  // Shed the centered-modal posture: flush to the prompt, no dimming scrim.
  onMount(() => {
    dialog.setSize("large")
    dialog.setAnchor("bottom")
    dialog.setScrim(false)
  })

  const entries$ = useKeymapSelector((keymap: OpenTuiKeymap) => {
    const reachable = keymap.getCommandEntries({
      namespace: "palette",
      visibility: "reachable",
      filter: isVisiblePaletteCommand,
    })
    const registeredBindings = keymap.getCommandBindings({
      visibility: "registered",
      commands: reachable.map((entry) => entry.command.name),
    })
    return reachable.map((entry) => ({
      ...entry,
      bindings: registeredBindings.get(entry.command.name) ?? entry.bindings,
    }))
  })

  const options = createMemo<ConsoleOption[]>(() =>
    entries$().map((entry) => {
      const category = typeof entry.command.category === "string" ? entry.command.category : undefined
      return {
        title: typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
        description: typeof entry.command.desc === "string" ? entry.command.desc : undefined,
        footer: formatKeyBindings(entry.bindings, config),
        value: entry.command.name,
        intent: intentFor(category),
        run: () => {
          dialog.clear()
          keymap.dispatchCommand(entry.command.name)
        },
      }
    }),
  )

  const [store, setStore] = createStore({ selected: 0, filter: "" })

  const filtered = createMemo<ConsoleOption[]>(() => {
    const needle = store.filter.trim()
    if (!needle) return options()
    return fuzzysort.go(needle, options(), { keys: ["title", "description"] }).map((result) => result.obj)
  })

  // Group by intent in INTENT_ORDER. When filtering, keep the grouping but only
  // surface intents that still have matches.
  const grouped = createMemo<[Intent, ConsoleOption[]][]>(() => {
    const byIntent = pipe(
      filtered(),
      groupBy((option) => option.intent),
      entries(),
    ) as [Intent, ConsoleOption[]][]
    return byIntent.sort(([a], [b]) => (INTENT_RANK.get(a) ?? 99) - (INTENT_RANK.get(b) ?? 99))
  })

  const flat = createMemo<ConsoleOption[]>(() => grouped().flatMap(([, group]) => group))

  const selected = createMemo(() => flat()[store.selected])

  // Snap the highlight back to the top whenever the filter narrows the list.
  createEffect(
    on(
      () => store.filter,
      () => moveTo(0, true),
    ),
  )

  const rows = createMemo(() => {
    const headers = grouped().length
    return flat().length + headers
  })
  const height = createMemo(() => Math.max(1, Math.min(rows(), Math.floor(dimensions().height / 2) - 4)))

  let scroll: ScrollBoxRenderable | undefined
  let input: InputRenderable | undefined

  function move(direction: number) {
    const total = flat().length
    if (total === 0) return
    let next = store.selected + direction
    if (next < 0) next = total - 1
    if (next >= total) next = 0
    moveTo(next, true)
  }

  function moveTo(next: number, center = false) {
    setStore("selected", next)
    if (!scroll) return
    const option = flat()[next]
    if (!option) return
    const target = scroll.getChildren().find((child: { id?: string }) => child.id === option.value)
    if (!target) return
    const y = target.y - scroll.y
    if (center) {
      scroll.scrollBy(y - Math.floor(scroll.height / 2))
      return
    }
    if (y >= scroll.height) scroll.scrollBy(y - scroll.height + 1)
    if (y < 0) scroll.scrollBy(y)
  }

  function submit() {
    selected()?.run()
  }

  useBindings(() => ({
    commands: [
      { name: "dialog.select.prev", title: "Previous item", category: "Dialog", run: () => move(-1) },
      { name: "dialog.select.next", title: "Next item", category: "Dialog", run: () => move(1) },
      { name: "dialog.select.page_up", title: "Page up", category: "Dialog", run: () => move(-10) },
      { name: "dialog.select.page_down", title: "Page down", category: "Dialog", run: () => move(10) },
      { name: "dialog.select.home", title: "First item", category: "Dialog", run: () => moveTo(0, true) },
      { name: "dialog.select.end", title: "Last item", category: "Dialog", run: () => moveTo(flat().length - 1, true) },
      { name: "dialog.select.submit", title: "Select item", category: "Dialog", run: submit },
    ],
    bindings: config.keybinds.gather("dialog.select", [
      "dialog.select.prev",
      "dialog.select.next",
      "dialog.select.page_up",
      "dialog.select.page_down",
      "dialog.select.home",
      "dialog.select.end",
      "dialog.select.submit",
    ]),
  }))

  return (
    <box paddingBottom={1} flexGrow={1}>
      {/* Sigil header: the gold `AC ›` command prompt, an esc affordance on the
          right — a command line, not a titled modal bar. */}
      <box paddingLeft={4} paddingRight={4} flexDirection="row" justifyContent="space-between">
        <text wrapMode="none">
          <span style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>{athenaTerminalPrefix} › </span>
          <span style={{ fg: theme.textMuted }}>command</span>
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <box paddingLeft={4} paddingRight={4} paddingTop={1}>
        <input
          onInput={(value: string) => setStore("filter", value)}
          focusedBackgroundColor={theme.backgroundPanel}
          cursorColor={theme.primary}
          focusedTextColor={theme.text}
          placeholder="filter the room…"
          placeholderColor={theme.textMuted}
          ref={(r: InputRenderable) => {
            input = r
            setTimeout(() => {
              if (input && !input.isDestroyed) input.focus()
            }, 1)
          }}
        />
      </box>

      <box flexGrow={1} flexShrink={1} paddingTop={1}>
        <Show
          when={flat().length > 0}
          fallback={
            <box paddingLeft={4}>
              <text fg={theme.textMuted}>nothing in the room matches that.</text>
            </box>
          }
        >
          <scrollbox
            paddingLeft={1}
            paddingRight={1}
            scrollbarOptions={{ visible: false }}
            ref={(r: ScrollBoxRenderable) => (scroll = r)}
            maxHeight={height()}
          >
            <For each={grouped()}>
              {([intent, group], groupIndex) => (
                <>
                  <box paddingTop={groupIndex() > 0 ? 1 : 0} paddingLeft={3}>
                    <text fg={theme.textMuted} attributes={TextAttributes.BOLD} wrapMode="none">
                      {intent}
                    </text>
                  </box>
                  <For each={group}>
                    {(option) => {
                      const active = createMemo(() => selected()?.value === option.value)
                      return (
                        <box
                          id={option.value}
                          flexDirection="row"
                          paddingRight={3}
                          gap={1}
                          backgroundColor={TRANSPARENT}
                          onMouseMove={() => {
                            const index = flat().findIndex((o) => o.value === option.value)
                            if (index >= 0) setStore("selected", index)
                          }}
                          onMouseUp={() => option.run()}
                        >
                          {/* Gold caret marks the selection — no filled block bar. */}
                          <text flexShrink={0} fg={theme.primary} wrapMode="none">
                            {active() ? " ❯ " : "   "}
                          </text>
                          <text
                            flexGrow={1}
                            fg={active() ? theme.accent : theme.text}
                            attributes={active() ? TextAttributes.BOLD : undefined}
                            overflow="hidden"
                            wrapMode="none"
                          >
                            {option.title}
                            <Show when={option.description}>
                              <span style={{ fg: theme.textMuted }}> {option.description}</span>
                            </Show>
                          </text>
                          <Show when={option.footer}>
                            <text flexShrink={0} fg={active() ? theme.primary : theme.textMuted} wrapMode="none">
                              {option.footer}
                            </text>
                          </Show>
                        </box>
                      )
                    }}
                  </For>
                </>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
    </box>
  )
}
