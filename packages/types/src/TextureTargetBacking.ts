import type { RenderTargetDescriptor } from './RenderTarget';
import type { TextureBackingKind } from './TextureBackingKind';

// GPU-origin backing descriptor carried by TextureStorage. `kind` is the open resolver-registry key;
// the built-in render-target producer declares `renderTexture`, while vendor producers use a prefix.
export interface TextureTargetBacking extends RenderTargetDescriptor {
  kind: TextureBackingKind;
}
