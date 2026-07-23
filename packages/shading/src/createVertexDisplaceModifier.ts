import type { Vector3Like, VertexDisplaceModifierOptions } from '@flighthq/types';
import { ModifierSlot, VertexDisplaceModifierKind } from '@flighthq/types';
import type { VertexDisplaceModifier } from '@flighthq/types';

// The options for `createVertexDisplaceModifier`. `source` and `amplitude` are required; the rest
// carry documented defaults. `source`, `axis` presence, and (for HeightMap) `map` presence are
// compile-time structural — they drive the define-key signature — while `amplitude`/`frequency`/
// `speed` are uniform-fed.

// Builds a VertexDisplaceModifier (slot: Vertex) — the one built-in VERTEX-stage modifier, displacing
// each vertex along its normal (or a fixed `axis`) before the model transform. `Sine` is a procedural
// traveling wave animated by the shading tier's per-frame `time` (using `frequency` default 1, `speed`
// default 1, `direction` default +X); `HeightMap` reads the amount from `map`'s red channel. `axis`,
// `map`, and `direction` are plain value pairs copied by reference only when provided.
export function createVertexDisplaceModifier(options: Readonly<VertexDisplaceModifierOptions>): VertexDisplaceModifier {
  const modifier: VertexDisplaceModifier = {
    kind: VertexDisplaceModifierKind,
    slot: ModifierSlot.Vertex,
    source: options.source,
    amplitude: options.amplitude,
    frequency: options.frequency ?? 1,
    speed: options.speed ?? 1,
    direction: options.direction ?? DEFAULT_DIRECTION,
  };
  if (options.axis !== undefined) modifier.axis = options.axis;
  if (options.map !== undefined) modifier.map = options.map;
  return modifier;
}

const DEFAULT_DIRECTION: Vector3Like = { x: 1, y: 0, z: 0 };
