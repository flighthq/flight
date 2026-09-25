import type { TextureSource } from './TextureSource.ts';
import type { ExternalTextureSourceKind } from './TextureSourceKind.ts';

/**
 * A foreign GPU texture bound by one render backend. The backend borrows and never uploads or owns
 * the associated GPU handle.
 */
export interface ExternalTexture extends TextureSource {
  readonly kind: typeof ExternalTextureSourceKind;
}
