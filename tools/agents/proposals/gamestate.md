---
id: gamestate
title: '@flighthq/gamestate'
type: new-package
target: gamestate
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/gamestate.md
  - tools/agents/docs/reviews/breadth/game-2d (the "No scene/screen state management" gap: *"No screen stack or state machine (menu/level/pause/game-over). `scene` is the 3D world graph.md
  - tools/agents/docs/reviews/breadth/not a game-state manager. Most engines ship this; here every game reinvents it."* Listed under missing packages as **`gamestate` / `screen`** — a screen/scene stack and FSM helper for game flow and entity state)..md
depends_on: []
updated: 2026-06-23
---

## Summary

Game flow as plain data: a screen/scene **stack** (push/pop/replace/set with enter/exit lifecycle and transitions) and a reusable **finite-state-machine** helper (states, guarded transitions, enter/update/exit) for app flow and per-entity behavior. The runtime layer that decides _which screen is active and what state an entity is in_ — not what it renders.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable game-flow layer: a working **screen stack** with enter/exit lifecycle, and a **basic FSM** with guarded transitions. This alone closes the headline gap — menu → level → pause → game-over flow, and "is this enemy idle/walking/dead?" — without every game hand-rolling it.

- **Types in `@flighthq/types` (header first):**
  - `GameScreenKind` string identifier (`'GameScreen'`); vendor-prefix convention for custom screen kinds (`'acme.LevelScreen'`).
  - `GameScreen` — entity descriptor: `{ kind: Kind; name: string; onEnter: GameScreenHook | null; onUpdate: GameScreenUpdateHook | null; onExit: GameScreenHook | null; onDraw: GameScreenHook | null; paused: boolean; opaque: boolean }`. `opaque` controls whether screens below it still update/draw (a transparent pause overlay leaves the level visible underneath).
  - `GameScreenHook` — `(screen: Readonly<GameScreen>, stack: Readonly<GameScreenStack>) => void`.
  - `GameScreenUpdateHook` — `(screen: Readonly<GameScreen>, deltaSeconds: number, stack: Readonly<GameScreenStack>) => void`.
  - `GameScreenStack` (entity) + `GameScreenStackRuntime` (opaque): runtime holds the ordered screen list, the pending-command queue, and (later) the active transition; the entity stays lean per the entity/runtime split.
  - `StateKind` string identifier (`'State'`); `StateId = string` (the state's name is its identity, string-keyed like every `*Kind`).
  - `StateNode` — `{ id: StateId; onEnter: StateHook | null; onUpdate: StateUpdateHook | null; onExit: StateHook | null }`.
  - `StateHook` / `StateUpdateHook` — `(machine: Readonly<StateMachine>) => void` / `(machine: Readonly<StateMachine>, deltaSeconds: number) => void`.
  - `StateTransition` — `{ from: StateId; to: StateId; guard: StateGuard | null }`; `StateGuard` — `(machine: Readonly<StateMachine>) => boolean` (return `false` to reject — sentinel, not throw).
  - `StateMachine` (entity) + `StateMachineRuntime` (opaque): `{ currentState: StateId | null; previousState: StateId | null }` on the entity; the node map, transition table, and elapsed-in-state on the runtime.
- **`@flighthq/gamestate` — screen stack:**
  - `createGameScreen(options: Readonly<GameScreenOptions>): GameScreen` — allocates a screen descriptor (defaults: `opaque: true`, `paused: false`, hooks `null`).
  - `createGameScreenStack(options?: Readonly<GameScreenStackOptions>): GameScreenStack` — allocates stack + runtime.
  - `pushGameScreen(stack: GameScreenStack, screen: Readonly<GameScreen>): void` — exits/suspends the current top (per `opaque`), enters the new screen.
  - `popGameScreen(stack: GameScreenStack): GameScreen | null` — exits the top, resumes the screen beneath; sentinel `null` when the stack is empty.
  - `replaceGameScreen(stack: GameScreenStack, screen: Readonly<GameScreen>): GameScreen | null` — pop + push as one atomic step (the common menu→level swap); returns the replaced screen or `null`.
  - `setGameScreen(stack: GameScreenStack, screen: Readonly<GameScreen>): void` — clears the whole stack to a single screen (hard scene change).
  - `getActiveGameScreen(stack: Readonly<GameScreenStack>): GameScreen | null` — top of stack; `null` if empty.
  - `getGameScreenCount(stack: Readonly<GameScreenStack>): number`.
  - `updateGameScreenStack(stack: GameScreenStack, deltaSeconds: number): void` — drains the pending command queue (so push/pop fired _inside_ a hook apply at a safe boundary, not mid-iteration), then calls `onUpdate` top-down honoring `opaque`/`paused`.
  - `drawGameScreenStack(stack: Readonly<GameScreenStack>): void` — calls `onDraw` bottom-up for visible screens (so an opaque level draws under a transparent pause overlay). Caller-supplied `onDraw` is what actually touches a renderer.
  - `clearGameScreenStack(stack: GameScreenStack): void` — exits and removes all screens.
  - `disposeGameScreenStack(stack: GameScreenStack): void` — clears screens and the command queue so the stack and its hooks become GC-eligible (detach-and-release → `dispose*`).
- **`@flighthq/gamestate` — finite-state machine:**
  - `createStateMachine(options?: Readonly<StateMachineOptions>): StateMachine` — allocates machine + runtime.
  - `addState(machine: StateMachine, node: Readonly<StateNode>): void` — registers a state by `id`; last-write-wins (a state can be redefined, matching the kind-registry convention).
  - `addStateTransition(machine: StateMachine, transition: Readonly<StateTransition>): void` — registers a legal `from → to` edge with optional guard.
  - `setStateMachineState(machine: StateMachine, state: StateId): boolean` — force-set (ignores the transition table; for initial state / hard resets); runs exit/enter; sentinel `false` if `state` is unknown.
  - `transitionStateMachine(machine: StateMachine, to: StateId): boolean` — the guarded path: looks up `currentState → to`, runs the guard, and on success runs `onExit(current)` then `onEnter(to)`; returns `false` if no edge exists or the guard rejects (expected failure — not a throw).
  - `updateStateMachine(machine: StateMachine, deltaSeconds: number): void` — calls the current state's `onUpdate` and accumulates time-in-state.
  - `getStateMachineState(machine: Readonly<StateMachine>): StateId | null` / `getStateMachinePreviousState(machine): StateId | null`.
  - `canTransitionStateMachine(machine: Readonly<StateMachine>, to: StateId): boolean` — dry-run the edge+guard lookup without firing (UI affordance / AI planning).
  - `disposeStateMachine(machine: StateMachine): void` — clears node/transition maps and hooks for GC.
- **Effort:** small-to-moderate. The command-queue boundary (mutating the stack from inside a hook) and `opaque`-aware update/draw walking are the only subtle pieces; the FSM is a map + edge lookup. The 80/20: a game wires `pushGameScreen(stack, pauseScreen)` on a keypress and `transitionStateMachine(enemy, 'Walking')` from AI — the single biggest game-runtime hole the review names is closed here.

### Silver

Competitive with a well-regarded game-flow layer (libGDX `Screen`/`ScreenAdapter` + `StateMachine`, Phaser's `SceneManager`, XNA/MonoGame's `GameStateManagement` sample, the classic stack-of-states pattern): **transitions with progress and easing**, **hierarchical/sub-state-machine** support, **input/update gating** between layers, and clean **per-entity reuse** so hundreds of enemies share one machine definition without per-entity allocation of the transition table.

- **Types in `@flighthq/types`:**
  - `GameScreenTransition` — `{ kind: GameScreenTransitionKind; durationSeconds: number; progress: number; easing: ((t: number) => number) | null; direction: GameScreenTransitionDirection }`. `progress` is 0..1; the caller's `onDraw` reads it to crossfade/slide. The package owns _timing_, not pixels.
  - `GameScreenTransitionKind` string `*Kind`s: `'None' | 'Fade' | 'Slide' | 'Push' | 'Cover'` (extensible; vendor-prefixed for custom). `GameScreenTransitionDirection` — `'In' | 'Out'`.
  - Extend `GameScreen` with `{ onTransitionUpdate: ((screen, transition) => void) | null; blockInputBelow: boolean }` — `blockInputBelow` lets a modal screen swallow input from screens beneath even when they still draw.
  - `StateMachineDefinition` — the **shared, immutable** state/transition graph (`{ states; transitions; initialState }`) separated from the per-instance `StateMachine`, so N entities reference one definition and only carry `currentState`/elapsed. This is the pooling/explicit-allocation discipline applied to FSMs.
  - `AnyState` sentinel `StateId` (`'*'`) for global transitions (`AnyState → 'Dead'`), the standard FSM convenience.
  - `StateHistory` config flag — record entered states for `'previous'`/back transitions (`HistoryState`-style).
- **`@flighthq/gamestate` — screens & transitions:**
  - `pushGameScreenWithTransition(stack, screen, transition: Readonly<GameScreenTransitionOptions>): void` and `popGameScreenWithTransition(stack, transition): GameScreen | null` — push/pop that run an outgoing+incoming transition; the stack advances `progress` during `updateGameScreenStack` and fires enter/exit at the documented boundaries (incoming `onEnter` at start, outgoing `onExit` at completion).
  - `getActiveGameScreenTransition(stack: Readonly<GameScreenStack>): GameScreenTransition | null` — the in-flight transition (drives the caller's crossfade); `null` when settled.
  - `isGameScreenStackTransitioning(stack: Readonly<GameScreenStack>): boolean`.
  - `getGameScreenAt(stack: Readonly<GameScreenStack>, index: number): GameScreen | null` and `forEachVisibleGameScreen(stack, visit)` — explicit traversal for custom draw/cull logic.
  - `pauseGameScreen(stack, screen)` / `resumeGameScreen(stack, screen)` — toggle a specific screen's `paused` (freeze the level while a sub-menu is open without popping it).
- **`@flighthq/gamestate` — FSM depth:**
  - `createStateMachineDefinition(options): StateMachineDefinition` and `createStateMachineFromDefinition(definition: Readonly<StateMachineDefinition>, obj?): StateMachine` — the shared-definition / per-instance split; `addState`/`addStateTransition` overloads accept a definition so a graph is authored once.
  - `addStateMachineSubState(machine, parent: StateId, child: Readonly<StateNode>)` and hierarchical `transitionStateMachine` resolution — **hierarchical state machines** (a `Combat` super-state containing `Attacking`/`Blocking`), so shared transitions live on the parent. `getStateMachineStatePath(machine): readonly StateId[]` returns the active super→leaf chain.
  - `addStateTransition` with `AnyState` source — global/from-any transitions.
  - `getStateMachineTimeInState(machine: Readonly<StateMachine>): number` — elapsed in the current state (timed transitions: "leave `Stunned` after 2s").
  - `evaluateStateMachineTransitions(machine): boolean` — auto-fire the first satisfied guarded transition from the current state (data-driven FSMs where guards, not explicit calls, drive flow); returns whether a transition fired.
  - `setStateMachineGlobalGuard(machine, guard)` — a guard consulted on every transition (e.g. block all state changes while `frozen`).
  - `getStateMachineHistory(machine): readonly StateId[]` / `transitionStateMachineToPrevious(machine): boolean` — history/back support.
- **Signals (opt-in):**
  - `enableGameScreenStackSignals(stack)` → `onGameScreenPush(screen)`, `onGameScreenPop(screen)`, `onGameScreenTransitionStart(transition)`, `onGameScreenTransitionComplete(transition)`.
  - `enableStateMachineSignals(machine)` → `onStateEnter(state)`, `onStateExit(state)`, `onStateTransition(from, to)`, `onStateTransitionRejected(from, to)`. For devtools, audio cues, and analytics — cost only when enabled.
- **Cross-backend consistency:** `gamestate` is renderer-agnostic; the same stack/FSM logic runs identically under Canvas/DOM/GL/WGPU and in Rust. Transitions expose _progress_, never pixels, so visual fidelity is the caller's `onDraw`/`onTransitionUpdate` concern — consistent by construction.
- **Effort:** moderate. Transition timing + the enter/exit boundary contract, and the definition/instance split with hierarchical resolution, are the substantive pieces. This is the tier that makes pause overlays with fades, modal input gating, and reusable enemy AI machines production-usable.

### Gold

Authoritative game-flow layer — exhaustive, deterministic, instrumented, and serializable. Nothing an engine author building a state-machine editor, a deterministic replay loop, or a flow profiler would find missing.

- **Types in `@flighthq/types`:**
  - `StateMachineGraphData` — fully serializable `{ states; transitions; initialState }` as plain data (string ids, no closures; guards referenced by registered name) for authoring in a visual editor and round-tripping — the seam a future `@flighthq/gamestate-formats` parses.
  - `StateGuardRegistry` / named-guard model — `registerStateGuard(name, guard)` so a serialized graph can name guards by string (closures cannot serialize). Mirrors the kind-registry string-identity model.
  - `GameScreenStackSnapshot` / `StateMachineSnapshot` — `{ screens: readonly string[] }` and `{ currentState; timeInState; history }` for save/restore (deterministic replay, save-games, editor undo).
  - `StateMachineStats` — `{ transitionCount; rejectedTransitionCount; timePerState: Readonly<Record<StateId, number>> }` rolling/aggregate profiling.
  - `GameScreenTransitionCurve` — richer transition descriptors (parameterized slide offset, per-channel timing) for parity with engine transition libraries.
- **`@flighthq/gamestate`:**
  - **Serialization & authoring (in `gamestate-formats` neighbor):** `parseStateMachineGraph(data: Readonly<StateMachineGraphData>): StateMachineDefinition`, `serializeStateMachineDefinition(definition): StateMachineGraphData`, and an importer for at least one common external format (e.g. an XState-JSON-shaped graph) following the `*-formats` pattern. Keeps parser weight out of the runtime crate.
  - **Snapshot / replay:** `captureGameScreenStackSnapshot(stack, out)` / `restoreGameScreenStackSnapshot(stack, snapshot, registry)` and `captureStateMachineSnapshot(machine, out)` / `restoreStateMachineSnapshot(machine, snapshot)` — alias-safe `out`-params; restore re-binds screens/states from a registry of known descriptors (snapshots store ids, not closures). The basis for deterministic replay and the Rust conformance harness.
  - **Parallel / orthogonal regions:** `addStateMachineRegion(machine, region)` + per-region `currentState` — concurrent states (a character `Movement` region and `Weapon` region active at once), the AAA FSM feature (statecharts' orthogonal regions).
  - **Deferred & queued events:** `sendStateMachineEvent(machine, eventName, payload?)` + event-triggered transitions (`StateTransition.event`), so transitions are event-driven (`'hit'`, `'land'`) rather than only guard-polled — the canonical statechart event model, with a documented queue-drain order matching the screen-stack command queue.
  - **Transition completeness:** `cancelGameScreenTransition(stack)`, `skipGameScreenTransition(stack)` (jump to settled), reversible transitions, and a documented contract for push-during-transition (queued, applied at completion).
  - **Stats & introspection:** `getStateMachineStats(machine, out)`, `resetStateMachineStats(machine)`, `forEachStateMachineState(machine, visit)`, `forEachStateMachineTransition(machine, visit)` — editor/devtool/profiler surface.
  - **Edge cases:** self-transitions (re-enter the same state, with a documented onExit/onEnter-or-not flag), transition to current state, empty-stack draw/update (no-op, not throw), unknown-state transition (`false`), and a deterministic, documented order when multiple `evaluateStateMachineTransitions` guards pass (first-registered wins).
- **Error handling:** every expected-failure path returns sentinels — `popGameScreen`/`replaceGameScreen` → `null` on empty, `transitionStateMachine`/`setStateMachineState`/`evaluateStateMachineTransitions` → `false`, `canTransitionStateMachine` dry-run → `boolean`. Only precondition violations a correct caller cannot reach throw (e.g. `addState` with a `null` id, a `durationSeconds < 0` on a transition, registering a region after the machine has started if disallowed).
- **Tests:** colocated `*.test.ts` per source file. Coverage: push/pop/replace/set ordering, `opaque`/`paused` update+draw walking, command-queue-during-hook boundary, transition progress + enter/exit timing, guarded/rejected/global/event transitions, hierarchical + parallel-region resolution, time-in-state and timed transitions, snapshot round-trip (stack and machine), and every `out`-param function in both distinct and aliased (`out === input`) forms.
- **Rust parity:** `flighthq-gamestate` mirrors the full surface; the stack-command boundary, guarded/hierarchical/parallel transition resolution, event-queue drain order, and snapshot round-trip are byte-for-byte conformance-tested against TS via the headless harness. No host split (pure logic) — the deterministic path _is_ the conformance reference. `flighthq-gamestate-formats` mirrors the parser.
- **Docs:** the screen-stack model (opaque vs transparent, update vs draw walk), the transition-progress contract (who owns pixels), the definition/instance FSM split, hierarchical + parallel-region recipes, the event-driven vs guard-polled decision, and the snapshot/replay recipe.
- **Effort:** the largest tier — serialization + named-guard registry, parallel regions, event-driven transitions, and snapshot/replay are each bounded but additive. Parallel regions and the event model are what make it "the canonical game-flow layer," not just a stack + a switch statement.

## Boundaries

- **No rendering.** `gamestate` never touches a renderer, display object, or canvas. Screens carry `onDraw` hooks the _caller_ implements; the package decides _which_ screens draw and in what order, and exposes transition _progress_ — it never produces pixels. Crossfade/slide visuals are the caller's `onDraw`/`onTransitionUpdate` code.
- **`scene` stays the 3D world graph.** Game "scenes" are `GameScreen`s here, deliberately renamed to avoid colliding with `@flighthq/scene`. `gamestate` does not manage spatial/world graphs.
- **Frame source stays in `@flighthq/application`.** No loop, no `requestAnimationFrame`, no `performance.now()`. `gamestate` consumes an explicit `deltaSeconds`; wiring it to the app loop (or to a future `@flighthq/clock` subscriber) is a caller/SDK concern. A `createGameStateClockSubscriber` convenience, if wanted, belongs in `clock`/SDK wiring, not here.
- **No transition tweening engine.** Easing is a plain `(t) => number` the caller passes (typically from `@flighthq/easing`); `gamestate` only advances `progress` linearly through `durationSeconds` and applies the easing — it does not depend on `@flighthq/tween`.
- **No entity/component system.** A `StateMachine` drives one entity's behavior state; it is not an ECS, a behavior tree, or a planner. Those are separate concerns (a behavior-tree package would be a sibling, not folded in).
- **No persistence backend.** Snapshots are plain data; writing them to disk is `@flighthq/storage`/`@flighthq/filesystem`. `gamestate` has no `*Backend` — it is pure logic.
- **Serialization lives in the `-formats` neighbor.** Parsing/serializing authored FSM graphs (and any external-format import) is `@flighthq/gamestate-formats`, keeping parser weight out of the runtime crate — the established `*-formats` split.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **`GameScreen` vs `GameState` as the stack noun.** "Screen" reads UI-ish; "state" collides with the FSM's `StateMachine` vocabulary in the same package. Leaning `GameScreen` for the stack (matches libGDX/Phaser/MonoGame) and reserving `State`/`StateMachine` strictly for the FSM, so the two halves stay verbally distinct. Confirm the pairing reads cleanly when both are imported together.
- **One package or two (`gamestate` + a separate FSM package)?** The screen stack and the FSM are independently useful, and a pure-FSM package (`@flighthq/statemachine`) could serve non-game uses (UI flows, network protocols). Counter-argument: they share the enter/update/exit lifecycle vocabulary and both are "control flow over named states," and the review explicitly asks for one `gamestate`/`screen` package. Leaning one package with two clean halves; split only if the FSM grows a non-game consumer set.
- **Command queue vs immediate mutation.** Push/pop fired from inside a hook must not corrupt mid-iteration. Bronze queues commands and drains them at the top of `updateGameScreenStack`. Confirm the drain timing (top-of-update vs end-of-update) and document it, since it determines whether a same-frame push is visible to that frame's draw.
- **Transition ownership of enter/exit timing.** Exactly when does the incoming screen's `onEnter` fire relative to the transition — at start (so it can prepare during the fade) or at completion? Leaning start-of-transition for `onEnter`, completion for the outgoing `onExit`, with `onTransitionUpdate` carrying `progress` between. Needs to be a documented, tested contract.
- **Self-transition semantics.** Does `transitionStateMachine(machine, currentState)` re-run exit+enter, or no-op? Both are valid in different engines; leaning a per-transition `reenter: boolean` flag defaulting to re-enter (the common "restart the state" expectation), confirmed against the timed-transition use case.
- **Guard polling vs event-driven (Bronze→Gold tension).** Bronze is explicit-`transitionStateMachine` + guards; Gold adds `sendStateMachineEvent`. Should event-driven be pulled earlier (Silver) given how central events are to game FSMs, or does the explicit/guard path cover enough until Gold? Leaning explicit+guard through Silver, events at Gold, but flag for re-prioritization based on game-2d follow-up.
- **Does the FSM need parallel regions at all for 2D games,** or is that statechart over-reach? Most 2D entity AI is a single active state; parallel regions are a Gold "completeness" feature. Confirm there's a real consumer (character movement × weapon × status) before building, or defer past Gold.
- **`gamestate-formats` external-format target.** If a serializable graph is built, which external format is the import on-ramp — XState JSON (web-ecosystem familiar) or a bespoke Flight FSM JSON? Decide alongside whether a visual editor is in scope at all (it may never be, making the neighbor unnecessary).

## Agent brief

> Create `@flighthq/gamestate` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
