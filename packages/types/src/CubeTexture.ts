import type { Texture } from './Texture';

export type CubeTexture = Extract<Texture, { dimension: 'cube' }>;
