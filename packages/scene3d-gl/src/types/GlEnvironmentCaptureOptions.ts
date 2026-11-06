import type { Environment } from '@flighthq/types/contract';
import type { Node3D } from '@flighthq/types/contract';

export interface GlEnvironmentCaptureOptions {
  environment?: Environment;
  excludeNode?: Node3D;
  far?: number;
  near?: number;
}
