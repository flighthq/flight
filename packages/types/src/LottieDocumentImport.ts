import type { AnimationClip } from './AnimationClip';
import type { DisplayObject } from './DisplayObject';
import type { Image } from './Image';
import type { LottieImageAsset } from './LottieDocument';

/**
 * Explicit external-resource seams for Lottie import. The importer performs no hidden acquisition;
 * callers resolve image assets to already-owned resources, matching SVG import.
 */
export interface LottieDocumentImportOptions {
  resolveImageResource?: (asset: Readonly<LottieImageAsset>) => Image | null;
}

/**
 * The two well-homed outputs of a Bodymovin document: its display subtree and one domain-bound clip.
 * Marker records become clip events. The clip's opaque targetRef descriptor remains a charter-scene2d
 * fork until the scene2d-owned versus importer-owned binding boundary is blessed.
 */
export interface LottieDocumentImportResult {
  clip: AnimationClip;
  duration: number;
  frameRate: number;
  root: DisplayObject;
}
