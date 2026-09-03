import type { AdvancedBlendMode } from './AdvancedBlendMode';
import type { Entity } from './Entity';
import type { EmbeddedImageResourceReference } from './ImageResourceReference';
import type { Node2D } from './Node2D';
import type { RenderEffect } from './RenderEffect';
import type { Scene2DDocument } from './Scene2DDocument';

/**
 * A SWF import, with the appearance a display tree cannot carry travelling beside the document rather
 * than being dropped or silently flattened onto a node. `createScene2DFromSwf` returns the document
 * alone for the callers — the importer registry among them — that only want the graph.
 */
export interface SwfDocumentImport extends Entity {
  /** Every placement appearance the caller has to realize itself. Empty for a file that uses none. */
  appearances: SwfNodeAppearance[];
  document: Scene2DDocument;
  /** Encoded JPEG colour and alpha halves retained for a caller-owned composition step. */
  jpegAlphaPayloads: SwfJpegAlphaPayload[];
}

/**
 * One DefineBitsJPEG3/4 payload, preserved without interpreting or copying either encoded stream.
 * The colour reference is the same object the document carries when the character is sampled.
 */
export interface SwfJpegAlphaPayload {
  characterId: number;
  compressedAlphaBytes: Uint8Array;
  /** The exact JPEG4 fixed-point field bits, or null because JPEG3 has no such field. */
  deblockingParameterRaw: number | null;
  height: number;
  reference: EmbeddedImageResourceReference;
  width: number;
}

/**
 * One placed instance's appearance at one frame, for the two channels a node cannot express.
 *
 * SWF puts a blend mode and a filter list on the same `PlaceObject3` record that carries the matrix, so
 * both are per-frame data on a specific instance — which is why a frame number, not just a node,
 * identifies one. Nothing here is attached: an effect is a descriptor the caller runs through the effect
 * pipeline explicitly, and `displayObject.filters` is a stated anti-goal.
 *
 * Only the appearance a node cannot carry appears. A fixed-function blend mode is written straight onto
 * `Node2D.blendMode`, and a colour-matrix filter — pointwise, so it folds into the draw — joins the
 * node's colour adjustments; neither produces an entry.
 */
export interface SwfNodeAppearance {
  /**
   * The placement's blend mode when it is destination-reading or non-separable, for the caller to
   * realize through a `BlendEffect`. Null when the record's mode folded onto the node.
   */
  advancedBlendMode: AdvancedBlendMode | null;
  /** The placement's filter list as effect descriptors, in authored order. Empty when it carries none. */
  effects: RenderEffect[];
  /** The 1-based frame of the timeline that owns this instance. */
  frame: number;
  node: Node2D;
}
