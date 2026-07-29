import type { Entity, Kind } from './Entity';

// Mesh UV channel selected independently by each PBR texture input. The canonical mesh layout
// currently exposes uv0 and uv1; extending the vertex contract grows this union deliberately.
export type PbrUvSet = 0 | 1;

// Open, kind-keyed PBR contribution descriptor. Built-in and vendor extensions share only Entity
// identity plus their registry kind; concrete scalar/map fields live in one header per extension.
export interface PbrExtension extends Entity {
  readonly kind: Kind;
}
