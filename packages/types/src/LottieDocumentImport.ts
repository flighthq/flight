import type { AdvancedBlendMode } from './AdvancedBlendMode.ts';
import type { AnimationClip } from './AnimationClip.ts';
import type { DisplayObject } from './DisplayObject.ts';
import type { Entity } from './Entity.ts';
import type { ImageResource } from './ImageResource.ts';
import type { LottieImageAsset } from './LottieDocument.ts';

/**
 * Explicit external-resource seams for Lottie import. The importer performs no hidden acquisition;
 * callers resolve image assets to already-owned resources, matching SVG import.
 */
export interface LottieDocumentImportOptions {
  resolveImageResource?: (asset: Readonly<LottieImageAsset>) => ImageResource | null;
}

/**
 * A layer whose blend mode cannot be fixed-function blend state, paired with the advanced mode it
 * asks for. Applying it means building a `BlendEffect`; import reports it and attaches nothing.
 */
export interface LottieAdvancedBlend {
  mode: AdvancedBlendMode;
  node: DisplayObject;
}

/**
 * The two well-homed outputs of a Bodymovin document: its display subtree and one domain-bound clip.
 * Marker records become clip events. The clip's opaque targetRef descriptor remains a charter-scene2d
 * fork until the scene2d-owned versus importer-owned binding boundary is blessed.
 */
export interface LottieDocumentImportResult extends Entity {
  /** Layers needing a `BlendEffect`, because their mode is destination-reading or non-separable. */
  advancedBlends: LottieAdvancedBlend[];
  clip: AnimationClip;
  duration: number;
  frameRate: number;
  root: DisplayObject;
}
