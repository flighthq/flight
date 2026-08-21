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
  kinds?: readonly string[];
  /**
   * Context attributes forwarded to whichever backend the target builds.
   *
   * `antialias` reaches the GL context only — Canvas 2D and DOM have no such switch and ignore it, and
   * WebGPU has no context-level AA at all. A scene declaring `no-aa` whose geometry is axis-aligned sets
   * it false so the DECLARATION and the CONTEXT agree; without it the harness applies GL's `antialias:
   * true` default and the declaration is a claim the picture does not support.
   */
  contextAttributes?: { alpha?: boolean; antialias?: boolean };
  syncPolicy?: Scene3DGraphSyncPolicy;
  clip?: boolean;
  cache?: boolean;
  blend?: boolean;
  strokePathTessellation?: boolean;
  expectedImageDescription?: string;
}
