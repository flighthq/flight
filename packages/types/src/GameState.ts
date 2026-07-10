// GameState header. `@flighthq/gamestate` orchestrates these plain-data states on a stack — the
// game-flow mode stack (boot, menu, play, pause, game-over). A state's actual update/draw is the
// caller's code, invoked through the state's lifecycle callbacks; the stack owns the transitions and
// decides which states are active, paused, or visible. This is flow control, not save data.

// One game state's lifecycle. Every callback is optional; a state that omits one simply has no
// behavior at that transition. `onEnter`/`onExit` fire when the state is pushed onto / removed from
// the stack; `onPause`/`onResume` fire when the state is covered by / re-exposed under another state
// (paired with push/pop, not replace). `onUpdate` ticks the active state each frame with the frame's
// `deltaTime`. `updateBelow` marks a transparent overlay whose state beneath keeps ticking (a HUD
// over a live game); `renderBelow` marks an overlay whose state beneath stays render-visible (a
// translucent pause menu over the frozen game). `name` is optional, for debugging/logging only — it
// carries no behavior. A `GameState` is plain data with no runtime identity; a literal is a valid
// `GameState`.
export interface GameState {
  name?: string;
  onEnter?: () => void;
  onExit?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onUpdate?: (deltaTime: number) => void;
  renderBelow?: boolean;
  updateBelow?: boolean;
}

// The game-state stack: `states` ordered bottom-to-top, so the last element is the active top. All
// stack state lives here — there is no module-global stack; a game holds its own `GameStateStack`.
export interface GameStateStack {
  states: GameState[];
}
