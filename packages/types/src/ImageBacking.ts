import type { Entity } from './Entity';
import type { TextureBackingKind } from './TextureBackingKind';

/**
 * Shared identity and dimensions for an open texture-backing family. Concrete backings declare their
 * own `kind` and payload; consumers dispatch through the renderer's backing registry rather than
 * inspecting nullable representation fields.
 */
export interface ImageBacking extends Entity {
  /** Pixel height. */
  height: number;
  /** Open resolver-registry key declared by the constructor or loader that owns this backing. */
  kind: TextureBackingKind;
  /** Bumped whenever the represented pixels change. */
  version: number;
  /** Pixel width. */
  width: number;
}
