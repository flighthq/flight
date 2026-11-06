import type { Environment } from '@flighthq/lighting/contract';
import type { Node3D } from '@flighthq/scene3d/contract';

export interface GlEnvironmentCaptureOptions {
  environment?: Environment;
  excludeNode?: Node3D;
  far?: number;
  near?: number;
}
