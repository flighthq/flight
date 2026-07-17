import type { ModifierKind } from './ModifierKind';
import type { ModifierSlot } from './ModifierSlot';

// A compiled shader augmentation injected into a ShadedMaterial's shading computation — the
// Material Feature / Modifier tier (see agents/effect-adjustment-architecture.md). Plain data
// carrying a `kind` discriminant and a `slot` naming where it contributes; per-backend GLSL
// snippets register a compiler against that `kind` and the @flighthq/shading compile path
// assembles `base + ordered modifiers` into ONE program, keyed by feature-set define-key.
//
// A Modifier is CODE (a snippet composed into the material program, producing a batchable variant),
// distinct from an Adjustment (DATA — a matrix/LUT feeding a fixed stage) and a RenderEffect (an
// offscreen pass). Anything that reduces to a color matrix or a LUT belongs in @flighthq/adjustments,
// not here.
//
// Modifier is an open base contract: a new modifier is added by defining its interface (extending
// Modifier with a literal `kind` and `slot`) and registering a per-backend compiler — no central
// union to edit here.
export interface Modifier {
  kind: ModifierKind;
  slot: ModifierSlot;
}
