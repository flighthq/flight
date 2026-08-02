import type { Node2D } from './Node2D';

export const Scene2DContentReferenceKind = {
  Asset: 'Asset',
  Slot: 'Slot',
} as const;

export type Scene2DContentReferenceKind =
  (typeof Scene2DContentReferenceKind)[keyof typeof Scene2DContentReferenceKind];

interface Scene2DContentReferenceBase {
  content: Node2D | null;
  name: string;
  required: boolean;
  target: Node2D;
}

export interface Scene2DAssetReference extends Scene2DContentReferenceBase {
  kind: 'Asset';
  // How the asset is addressed. A format that embeds its assets has no address to fetch from, so `uri`
  // names the asset within its document and `bytes` carries it.
  uri: string;
  // Encoded bytes the document carried inline, or null when the asset lives at `uri`. Held as a view over
  // the source rather than a copy, and never decoded at import: decoding is the resolve step's job, so a
  // caller that never resolves an embedded asset never pays for its pixels.
  bytes: Uint8Array | null;
  // Media type of `bytes` when the document could identify one, for a resolver dispatching by format.
  mimeType: string | null;
}

export interface Scene2DSlotReference extends Scene2DContentReferenceBase {
  kind: 'Slot';
  linkage: string | null;
}

export type Scene2DContentReference = Scene2DAssetReference | Scene2DSlotReference;

// A static, renderer-neutral named-graph document. `root` is an unattached authored hierarchy and
// `references` is its enumerable content contract and retains each installed content binding. Applications
// fill references only through the scene2d-resources resolve/load APIs; targets are retained here so codecs
// can bind each manifest entry without a parallel path language or hidden runtime.
export interface Scene2DDocument {
  references: Scene2DContentReference[];
  root: Node2D;
  sourceKind: string | null;
}
