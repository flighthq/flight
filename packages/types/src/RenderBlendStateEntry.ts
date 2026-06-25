import type { BlendMode } from './BlendMode';
export interface RenderBlendStateEntry {
  readonly alpha: number;
  readonly blendMode: BlendMode | null;
}
