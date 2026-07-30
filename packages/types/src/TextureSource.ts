import type { Entity } from './Entity';
import type { TextureSourceKind } from './TextureSourceKind';

/**
 * Shared identity and dimensions for an open texture-source family. Concrete sources declare their
 * own `kind` and payload; consumers dispatch through the renderer's source registry rather than
 * inspecting nullable representation fields.
 */
export interface TextureSource extends Entity {
  /** Pixel height. */
  height: number;
  /** Open resolver-registry key declared by the constructor or loader that owns this source. */
  kind: TextureSourceKind;
  /** Bumped whenever the represented pixels change. */
  version: number;
  /** Pixel width. */
  width: number;
}
