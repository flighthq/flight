import type { ImageResource } from './ImageResource';
import type { RenderTargetDescriptor } from './RenderTarget';

// Two-dimensional texture storage composes the closed sampling dimension with an open backing.
// CPU-origin content uses `image`; GPU-origin produced content uses `target` with no image. Backend
// resolver registries own realization and can distinguish these fields without a texture subtype.
export interface TextureStorage {
  dimension: '2d';
  image: ImageResource | null;
  target?: RenderTargetDescriptor;
}
