import type { Environment } from './Environment';
import type { Node3D } from './Node3D';

export interface GlEnvironmentCaptureOptions {
  environment?: Environment;
  excludeNode?: Node3D;
  far?: number;
  near?: number;
}
