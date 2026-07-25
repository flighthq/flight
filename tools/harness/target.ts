import type { Scene3DGraphSyncPolicy } from '@flighthq/sdk';
import type {
  FunctionalCanvasTarget,
  FunctionalDomTarget,
  FunctionalGlTarget,
  FunctionalTarget,
  FunctionalWgpuTarget,
} from '@ft/verify';

export type { FunctionalCanvasTarget, FunctionalDomTarget, FunctionalGlTarget, FunctionalTarget, FunctionalWgpuTarget };

export interface FunctionalTargetOptions {
  width: number;
  height: number;
  background?: number;
  kinds?: readonly symbol[];
  contextAttributes?: { alpha?: boolean };
  syncPolicy?: Scene3DGraphSyncPolicy;
  clip?: boolean;
  cache?: boolean;
  blend?: boolean;
}
