import type { ImageResourceReference } from './ImageResourceReference';
import type { TextureLike } from './Texture';

type CreateTextureVariantOptions<Type extends TextureLike> = Type extends TextureLike
  ? Omit<Partial<Type>, 'dimension'> &
      (Type['dimension'] extends '2d' ? { readonly dimension?: '2d' } : { readonly dimension: Type['dimension'] })
  : never;

export type CreateTextureOptions = CreateTextureVariantOptions<TextureLike> & {
  readonly resource?: ImageResourceReference | null;
};
