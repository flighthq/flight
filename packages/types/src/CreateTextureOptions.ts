import type { ImageResourceReference } from './ImageResourceReference';
import type { TextureLike } from './Texture';

type CreateTextureVariantOptions<Type extends TextureLike> = Type extends TextureLike
  ? Omit<Partial<Type>, 'dimension'> &
      (Type['dimension'] extends '2d' ? { readonly dimension?: '2d' } : { readonly dimension: Type['dimension'] })
  : never;

export type CreateTextureOptions = CreateTextureVariantOptions<TextureLike> & {
  readonly resource?: ImageResourceReference | null;
};

// The two-dimensional variant on its own, so a caller that knows the dimension can name the options it
// is actually passing rather than the union of all four. Kept as a projection of CreateTextureOptions
// rather than a hand-written twin: a field added to the union appears here without a second edit, and
// the two cannot drift.
export type CreateTexture2DOptions = Extract<CreateTextureOptions, { dimension?: '2d' }>;
