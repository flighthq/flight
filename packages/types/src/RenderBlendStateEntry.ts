import type { BlendMode } from './BlendMode.ts';
export interface RenderBlendStateEntry {
  readonly alpha: number;
  readonly blendMode: BlendMode | null;
}
