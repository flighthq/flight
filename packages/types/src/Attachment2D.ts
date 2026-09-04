import type { Entity } from './Entity';

// The base contract for a 2D skeletal attachment — the drawable (or queryable) thing a Slot2D shows on
// its bone: a textured region, a deformable mesh, and later a bounding box / path / clipping / point.
// An OPEN family: each concrete attachment is its own type carrying a string `kind`, dispatched by a
// registry/switch in the deformer and display layers, so a consumer can add a custom attachment kind
// (vendor-prefixed) without editing a central union. Mirrors the Material / RenderEffect open-family
// posture. The runtime interprets an attachment against the slot's bone world transform.
export interface Attachment2D extends Entity {
  kind: string;
  name?: string | null;
}
