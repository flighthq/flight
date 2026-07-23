import type { Modifier } from './Modifier';
import type { ModifierKind } from './ModifierKind';
import type { ModifierSlot } from './ModifierSlot';

// The substrate-agnostic registration record for one modifier kind: where it injects (`slot`) and
// how its descriptor's compile-time structure contributes to the define-key (`getDefineSignature`).
// It carries NO backend GLSL — per-backend compilers (e.g. @flighthq/scene-gl) register their own
// snippet against the same `kind` in a backend-side registry. This tier only owns the composition
// contract: slot ordering and the stable define-key that keys the compiled variant cache.
//
// `getDefineSignature` returns a short token naming which OPTIONAL, compile-time-affecting features
// of a modifier instance are structurally present (a mask texture, a facing gate, a second normal
// layer) — the things that change the emitted program, not the uniform-fed scalars (color, strength)
// that leave the program identical. It is a pure function of descriptor structure so the define-key
// is deterministic; omit it (or return `''`) when a kind has exactly one program shape.
export interface ModifierDefinition {
  kind: ModifierKind;
  slot: ModifierSlot;
  getDefineSignature?: (modifier: Readonly<Modifier>) => string;
}
