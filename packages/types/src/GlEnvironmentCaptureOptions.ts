import type { Environment } from './Environment.ts';
import type { Node3D } from './Node3D.ts';

export interface GlEnvironmentCaptureOptions {
  environment?: Environment;
  excludeNode?: Node3D;
  far?: number;
  near?: number;
}
