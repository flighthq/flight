import type { Texture } from './Texture.ts';

export type CubeTexture = Extract<Texture, { dimension: 'cube' }>;
