import type { AudioResourceReference } from './AudioResourceReference';
import type { Entity } from './Entity';
import type { ImageResourceReference } from './ImageResourceReference';
import type { Node2D } from './Node2D';

// A named place in the authored graph where the application supplies content the document does not carry.
// The document knows the slot exists and where it goes; only the application knows what belongs in it, so
// this is the one reference whose resolution produces a Node2D.
export interface Scene2DSlotReference {
  content: Node2D | null;
  // The authoring-time class/symbol name a format recorded for this slot, when it recorded one. A resolver
  // dispatching on an exported symbol reads this rather than matching on `name`.
  linkage: string | null;
  name: string;
  required: boolean;
  target: Node2D;
}

// A static, renderer-neutral named-graph document. `root` is the complete authored hierarchy: an importer
// decides the graph's shape at parse, so nothing downstream can change what a node IS — only what a slot
// holds and what pixels a texture carries.
//
// The three sidecar arrays are the document's enumerable contracts, split by what resolving one produces:
//
//   slots          — a node the application supplies. Resolves synchronously through resolveScene2DResources.
//   imageResources — pixels the document carried or named. Each reference lists the waiting Textures already
//                    wired into `root`; loading one binds its decoded Image into all of them at once, so a
//                    character placed a hundred times decodes once.
//   audioResources — samples the document carried or named, on exactly the image lane's terms: each
//                    reference lists the waiting AudioResources, and loading one fills all of them. What
//                    *triggers* a sound is not here — an authored cue lives on the TimelineSource that
//                    carries it, and only a registered handler plays anything. A document stays static.
//
// A format that embeds a whole sub-document (a nested or data-uri SVG) recurses through the importer
// registry at parse instead, which is why neither array carries a node-producing byte payload.
export interface Scene2DDocument extends Entity {
  audioResources: AudioResourceReference[];
  // The authored stage colour as packed RGBA, or null when the format declares none. It is document
  // metadata rather than content — a colour the viewport clears to, not a node in the graph — so an
  // application decides whether to honour it and nothing in `root` depends on it.
  backgroundColor: number | null;
  imageResources: ImageResourceReference[];
  root: Node2D;
  slots: Scene2DSlotReference[];
  sourceKind: string | null;
}
