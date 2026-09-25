import type { TextureContainerKind } from './TextureContainerKind.ts';
import type { TextureContainerParseFailureReason } from './TextureContainerParseFailureReason.ts';

export interface TextureContainerParseExplanation {
  readonly container: TextureContainerKind | null;
  readonly reason: TextureContainerParseFailureReason;
}
