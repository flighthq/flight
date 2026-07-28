import type { ImageResource } from './ImageResource';

// Step-one storage shape: a two-dimensional texture backed by a broad ImageResource. Later storage
// variants add cube, array, volume, and produced backings without widening Surface itself.
export interface TextureStorage {
  dimension: '2d';
  image: ImageResource | null;
}
