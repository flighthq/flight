import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Vector3Like,
  VertexDisplaceModifier,
  VertexDisplaceModifierOptions,
  EntityConstruction,
} from '@flighthq/types/contract';
import { ModifierSlot, VertexDisplaceModifierKind } from '@flighthq/types/contract';

import { initializeModifier } from './modifier';

// The options for `createVertexDisplaceModifier`. `source` and `amplitude` are required; the rest
// carry documented defaults. `source`, `axis` presence, and (for HeightMap) `map` presence are
// compile-time structural — they drive the define-key signature — while `amplitude`/`frequency`/
// `speed` are uniform-fed.

export function createVertexDisplaceModifier(options: Readonly<VertexDisplaceModifierOptions>): VertexDisplaceModifier {
  const out = allocateEntity<VertexDisplaceModifier>();
  initializeVertexDisplaceModifier(out, options);
  return finishEntity(out);
}

// Builds a VertexDisplaceModifier (slot: Vertex) — the one built-in VERTEX-scene2d modifier, displacing
// each vertex along its normal (or a fixed `axis`) before the model transform. `Sine` is a procedural
// traveling wave animated by the shading tier's per-frame `time` (using `frequency` default 1, `speed`
// default 1, `direction` default +X); `HeightMap` reads the amount from `map`'s red channel. `axis`,
// `map`, and `direction` are plain value pairs copied by reference only when provided.
export function initializeVertexDisplaceModifier(
  out: EntityConstruction<VertexDisplaceModifier>,
  options: Readonly<VertexDisplaceModifierOptions>,
): void {
  initializeModifier(out, VertexDisplaceModifierKind, ModifierSlot.Vertex);
  out.source = options.source;
  out.amplitude = options.amplitude;
  out.frequency = options.frequency ?? 1;
  out.speed = options.speed ?? 1;
  out.direction = options.direction ?? DEFAULT_DIRECTION;
  if (options.axis !== undefined) out.axis = options.axis;
  if (options.map !== undefined) out.map = options.map;
}

const DEFAULT_DIRECTION: Vector3Like = { x: 1, y: 0, z: 0 };
