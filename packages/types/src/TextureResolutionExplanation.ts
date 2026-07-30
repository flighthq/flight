import type { TextureSourceKind } from './TextureSourceKind';

export type TextureResolutionStatus = 'missing-kind' | 'missing-resolver' | 'registered';

/**
 * Describes only resolver availability. A registered resolver may still return its own null sentinel
 * while a resource is unavailable or not ready.
 */
export interface TextureResolutionExplanation {
  readonly kind: TextureSourceKind | null;
  readonly status: TextureResolutionStatus;
}
