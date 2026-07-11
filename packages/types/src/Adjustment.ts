import type { AdjustmentKind } from './AdjustmentKind';

// Substrate-agnostic pointwise value-remap intents. Each is plain data carrying a `kind` discriminant;
// a stack of adjustments (a plain `readonly Adjustment[]`) fuses into ONE artifact as data — a single
// 4×5 color matrix (linear ops) or one baked LUT (arbitrary value→value) — and folds into the draw,
// never bouncing through an offscreen pass. This is the fuse-and-fold sibling of the chain-and-bounce
// RenderEffect; see agents/effect-adjustment-architecture.md for the full model.
// Adjustment is an open base contract: a new adjustment is added by defining its interface (extending
// Adjustment with a literal `kind`) and contributing its matrix/LUT — no central union to edit here.
// There is deliberately no container/wrapper type: the plural is a function name, not an invented noun.

// Open base contract for every pointwise adjustment. The `kind` is the canonical PascalCase type name
// and the registry key a per-backend realization is registered against.
export interface Adjustment {
  kind: AdjustmentKind;
}
