import type { Projection } from './Camera3D.ts';
import type { Plane } from './Plane.ts';

// Structural inputs for createCamera3D.
export interface Camera3DOptions {
  far: number;
  near: number;
  nearClipPlane?: Plane | null;
  projection: Projection;
}
