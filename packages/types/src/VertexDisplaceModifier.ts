import type { Modifier } from './Modifier';
import type { Texture } from './Texture';
import type { Vector3Like } from './Vector3';

// How a VertexDisplaceModifier drives its per-vertex offset amount. `Sine` is a procedural traveling
// wave `sin(dot(position, direction) * frequency + time * speed)` — no texture, the animated-flag /
// water / jelly case; `HeightMap` reads the displacement amount from a texture's red channel sampled
// at the vertex UV — the terrain / bump-extrude case. A small CLOSED vocabulary owned here (canonical
// PascalCase, serialized verbatim, no vendor path), derived from the const so the two never drift.
export const VertexDisplaceModifierSource = {
  HeightMap: 'HeightMap',
  Sine: 'Sine',
} as const;

export type VertexDisplaceModifierSource =
  (typeof VertexDisplaceModifierSource)[keyof typeof VertexDisplaceModifierSource];

// Displaces each vertex along its normal (or a fixed axis) before the model transform (slot: Vertex).
// This is the one built-in VERTEX-stage modifier: its GLSL runs in the vertex shader, moving the
// local position (and re-deriving the normal for `Sine`), where every other modifier injects into the
// fragment stage. Generalizes waving flags, ocean swell, jelly wobble, and heightmap terrain extrude.
//
// `amplitude` scales the offset; `axis` (omitted = the surface normal) is the fixed direction to push
// along when set (a Vector3Like value pair, not the Vector3 entity — it carries no runtime identity).
// `Sine` uses `frequency`/`speed`/`direction` for the traveling wave and is animated by the shading
// tier's per-frame `time`; `HeightMap` uses `map` (the red channel is the amount) and ignores the
// wave params.
export interface VertexDisplaceModifier extends Modifier {
  kind: 'VertexDisplaceModifier';
  slot: 'Vertex';
  source: VertexDisplaceModifierSource;
  amplitude: number;
  axis?: Vector3Like; // fixed push direction; omitted = displace along the surface normal
  map?: Texture; // HeightMap: red-channel displacement amount; required for HeightMap, ignored by Sine
  frequency?: number; // Sine: spatial wave frequency. Default 1.
  speed?: number; // Sine: temporal scroll speed (radians/sec against `time`). Default 1.
  direction?: Vector3Like; // Sine: wave travel direction in local space. Default +X (1,0,0).
}

export const VertexDisplaceModifierKind = 'VertexDisplaceModifier';
