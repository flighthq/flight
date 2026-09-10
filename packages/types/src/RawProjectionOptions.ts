import type { Matrix4Like } from './Matrix4';

// Structural inputs for createRawProjection. The matrix is copied, not referenced.
export interface RawProjectionOptions {
  matrix: Readonly<Matrix4Like>;
}
