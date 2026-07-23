import type { Projection } from './Camera3D';

// Structural inputs for createCamera3D.
export interface Camera3DOptions {
  far: number;
  near: number;
  projection: Projection;
}
