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
  // ★ DefineText, DefineText2 — STATIC TEXT BECOMES SHAPES, NOT A TEXT NODE. The glyphs are converted
  // to outlines and drawn as `Shape`, which `swfDocument.test.ts` asserts directly. These two were
  // missing because the map was first built from handlers owning `createPlacementNode`, and the static
  // text handler owns none: the document importer builds those nodes itself. That rule was too narrow,
  // and the cost was silent — a text-only SWF resolved its parser handler and no renderer at all, so it
  // parsed correctly and drew nothing.
  [11, [ShapeKind]],
  [33, [ShapeKind]],
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

// `DefineSprite` is likewise absent from the tag table above: it becomes a MovieClip, and a MovieClip
// needs no renderer for the reason below.
//
// ★ MovieClip IS DELIBERATELY ABSENT, AND IT IS NOT A GAP. The importer does build MovieClip nodes — a
// SWF root is one, and `DefineSprite` becomes one — but a MovieClip is a pure CONTAINER and needs no
// renderer of its own: the render walk traverses the hierarchy regardless of whether a node's kind has
// a renderer, and the children draw themselves. The `movieclip` example is the proof, registering only
// `ShapeKind` and `TextLabelKind` renderers across all four backends and rendering correctly. Listing
// MovieClip here would therefore demand a renderer that should not exist, putting a permanently
// unsatisfiable requirement in every SWF build.
