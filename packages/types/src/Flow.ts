// FlowState header. `@flighthq/flow` orchestrates these plain-data states on a stack — the
// application mode/screen flow stack (boot, menu, play, pause, game-over). A state's actual
// update/draw is the caller's code, invoked through the state's lifecycle callbacks; the stack owns
// the transitions and decides which states are active, paused, or visible. This is flow control, not
// save data.

// One application state's lifecycle. Every callback is optional; a state that omits one simply has no
// behavior at that transition. `onEnter`/`onExit` fire when the state is pushed onto / removed from
// the stack; `onPause`/`onResume` fire when the state is covered by / re-exposed under another state
// (paired with push/pop, not replace). `onUpdate` ticks the active state each frame with the frame's
// `deltaTime`. `updateBelow` marks a transparent overlay whose state beneath keeps ticking (a HUD
// over a live screen); `renderBelow` marks an overlay whose state beneath stays render-visible (a
// translucent pause menu over the frozen screen). `name` is optional, for debugging/logging only — it
// carries no behavior. A `FlowState` is plain data with no runtime identity; a literal is a valid
// `FlowState`.
export interface FlowState {
  name?: string;
  onEnter?: () => void;
  onExit?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onUpdate?: (deltaTime: number) => void;
  renderBelow?: boolean;
  updateBelow?: boolean;
}

// The flow-state stack: `states` ordered bottom-to-top, so the last element is the active top. All
// stack state lives here — there is no module-global stack; an app holds its own `FlowStack`.
export interface FlowStack {
  states: FlowState[];
}
