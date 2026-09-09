import type { Node3D } from './Node3D';

export interface GlEnvironmentCaptureOptions {
  excludeNode?: Node3D;
  far?: number;
  near?: number;
}
