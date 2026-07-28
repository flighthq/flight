import type { ImageResourceReference } from './ImageResourceReference';
import type { TextureLike } from './Texture';

export type CreateTextureOptions = Partial<TextureLike> & {
  readonly resource?: ImageResourceReference | null;
};
