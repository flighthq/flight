import type { RenderEffect } from './RenderEffect';

// Lens dirt: smudges/dust on the lens that catch the light — procedural soft blobs brighten where the
// scene is bright, a cheap bloom-dirt overlay. `seed` varies the smudge layout.
export interface LensDirtEffect extends RenderEffect {
  kind: 'LensDirtEffect';
  intensity?: number; // brightness added through the dirt. Default 1.
  threshold?: number; // scene luminance above which dirt catches light. Default 0.55.
  seed?: number; // smudge layout.
}
