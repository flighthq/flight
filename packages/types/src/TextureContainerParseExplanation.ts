import type { TextureContainerKind } from './TextureContainerKind';
import type { TextureContainerParseFailureReason } from './TextureContainerParseFailureReason';

export interface TextureContainerParseExplanation {
  readonly container: TextureContainerKind | null;
  readonly reason: TextureContainerParseFailureReason;
}
