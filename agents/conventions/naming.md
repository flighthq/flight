# Naming Conventions

## The `default*` prefix

Exported names that start with `default` are **pluggable stock implementations** — values a caller selects or overrides, not standalone API functions. The naming convention distinguishes three categories by suffix:

### Renderer and effect objects

Pre-built renderer or effect-runner objects registered by kind. The existing noun suffix (`Renderer`, `EffectRunner`) already signals "this is a value."

Examples: `defaultCanvasBitmapRenderer`, `defaultGlBitmapRenderer`, `defaultWgpuBloomEffectRunner`.

No additional suffix needed — the noun makes the role clear.

### Hit-test handlers (`*Handler`)

Functions registered into the hit-test-point registry via `registerHitTest(kind, handler)`. Use the `Handler` suffix to signal "this is a value you register," not "this is a function you call directly."

Examples: `defaultBitmapHitTestHandler`, `defaultShapeHitTestHandler`, `defaultSpriteHitTestHandler`.

### Runtime trait callbacks (`*Callback`)

Fallback functions wired into runtime trait slots via nullish coalescing (`field ?? defaultCallback`). Users building custom node kinds reference these as the stock behavior to keep or replace. Use the `Callback` suffix.

Examples: `defaultCanAddChildCallback`, `defaultComputeLocalBoundsRectangleCallback`.

### When not to use `default`

Regular exported functions — even if they happen to provide a common-case implementation — should not use the `default` prefix. The prefix is reserved for values that plug into a registration or callback slot. A function that callers invoke directly uses the standard verb prefix (`compute*`, `get*`, `create*`, etc.).
