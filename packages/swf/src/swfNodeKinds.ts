import type { Kind } from '@flighthq/types/contract';
import {
  DisplayObjectKind,
  MorphShapeKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
} from '@flighthq/types/contract';

/**
 * Which scene node kinds a SWF tag becomes — the fact that turns a TAG requirement into a RENDERER
 * requirement at build time.
 *
 * ★ WHY THIS IS A MODULE AND NOT A FIELD ON EACH HANDLER. It began as a `producesKinds` property on
 * each handler's `instantiate`, sitting next to the code that builds the node. That reads better and
 * costs real bytes: a handler is an object LITERAL, so a property on it CANNOT be tree-shaken, and
 * every build that reads a SWF carried build-time metadata it never executes — measured at +52 bytes
 * gzipped across the fourteen handlers, and growing with every handler and kind added. A module-level
 * binding shakes: a build that does not import this map does not pay for it, and the only importer is
 * the catalog generator, which runs at build time and ships nothing.
 *
 * Keyed by TAG CODE so it lines up with `SwfTagHandler.tags`, which is what lets the drift test assert
 * coverage against the handlers themselves rather than trust this list. Only tags whose handler builds
 * a placement node appear: `DefineBitsLossless` is read by a handler that produces no node, so it is
 * absent on purpose rather than forgotten.
 *
 * Every kind a tag can EVER become belongs here, including conditional ones: a shape yields
 * `Scale9Shape` when a scaling grid is present and `Shape` otherwise, and a build must be able to draw
 * either. Over-declaring costs one unused renderer; under-declaring costs a missing one and a node that
 * silently fails to draw, so the list is what a tag CAN produce, not what one document happened to need.
 */
export const SWF_TAG_NODE_KINDS: ReadonlyMap<number, readonly Kind[]> = new Map([
  // DefineShape, DefineShape2, DefineShape3, DefineShape4
  [2, [ShapeKind, Scale9ShapeKind]],
  [22, [ShapeKind, Scale9ShapeKind]],
  [32, [ShapeKind, Scale9ShapeKind]],
  [83, [ShapeKind, Scale9ShapeKind]],
  // DefineMorphShape, DefineMorphShape2
  [46, [MorphShapeKind]],
  [84, [MorphShapeKind]],
  // DefineBits, JPEGTables, DefineBitsJPEG2, DefineBitsJPEG3, DefineBitsJPEG4 — the JPEG handler
  // builds a textured sprite, and claims JPEGTables alongside the characters that reference it.
  [6, [SpriteKind]],
  [8, [SpriteKind]],
  [21, [SpriteKind]],
  [35, [SpriteKind]],
  [90, [SpriteKind]],
  // DefineVideoStream
  [60, [SpriteKind]],
  // DefineEditText
  [37, [RichTextKind]],
]);

/**
 * The kinds a SWF document produces regardless of which tags it carries.
 *
 * NOT derivable from the tag table above, and a per-tag translation alone would silently miss them:
 * the importer builds a `MovieClip` root for every document, and `DefineSprite` becomes a MovieClip
 * through the document's own timeline machinery rather than through any handler's `createPlacementNode`.
 * A build whose translation omitted these would resolve renderers for the leaves and none for the root.
 */
export const SWF_DOCUMENT_NODE_KINDS: readonly Kind[] = [DisplayObjectKind];

// ★ MovieClip IS DELIBERATELY ABSENT, AND THAT IS A FINDING RATHER THAN AN OVERSIGHT. The importer does
// build MovieClip nodes — a SWF root is one, and `DefineSprite` becomes one — but NO 2D backend binds
// `MovieClipKind` to a renderer: canvas, gl and wgpu each bind thirteen kinds and MovieClip is not among
// them, and `@flighthq/interaction` binds only a hit test. Listing it here would put a requirement in
// every SWF build that no catalog row could ever satisfy, warning on every build about a gap that is the
// SDK's rather than the document's — the same unactionable-diagnostic pattern the SWF tag filter exists
// to avoid. Whether MovieClip should render through the container renderer or has no draw of its own is
// an open question for the render packages, not something a translation table may decide by guessing.
// `swfNodeKinds.test.ts` fails if any kind named here or above stops being bound by every backend.
