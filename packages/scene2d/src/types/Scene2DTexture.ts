import type { Scene2DEntity } from './Scene2DEntity.ts';

// Texture is not yet recovered into its owner package. Keep its complete discriminated storage shape
// private here; the opaque fields deliberately accept the legacy contract in either direction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene2DTextureOpaque = any;
interface Scene2DTextureCommon extends Scene2DEntity {
  colorSpace: 'linear' | 'srgb';
  flipX: boolean;
  flipY: boolean;
  sampler: Scene2DTextureOpaque;
  uvOffset: Scene2DTextureOpaque;
  uvRotation: number;
  uvScale: Scene2DTextureOpaque;
  version: number;
}
export type Scene2DTexture = Scene2DTextureCommon &
  (
    | { readonly dimension: '2d'; source: Scene2DTextureOpaque }
    | { readonly dimension: '2d-array'; sources: readonly Scene2DTextureOpaque[] }
    | { readonly dimension: '3d'; source: Scene2DTextureOpaque }
    | {
        readonly dimension: 'cube';
        sources: readonly [
          Scene2DTextureOpaque,
          Scene2DTextureOpaque,
          Scene2DTextureOpaque,
          Scene2DTextureOpaque,
          Scene2DTextureOpaque,
          Scene2DTextureOpaque,
        ];
      }
  );
