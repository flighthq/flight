// @ft/render — the functional harness's render-target factory for backend-agnostic scenes. The
// backend is a RUNTIME property of the page: the entry sets `window.__ftBackend` from the
// `/tests/<name>/<backend>/` route before the scene module evaluates, so one backend-agnostic scene
// file runs on every backend with no build-time import resolution (no `?render=` trampoline). A
// backend-specific `<name>.<backend>.ts` scene does not use this — it builds its own state directly.
import type { FunctionalTarget, FunctionalTargetOptions } from './target';

export type {
  FunctionalCanvasTarget,
  FunctionalDomTarget,
  FunctionalGlTarget,
  FunctionalTarget,
  FunctionalWgpuTarget,
} from './target';
export type { FunctionalTargetOptions };

type BackendWindow = typeof window & { __ftBackend?: string };

// Each backend is dynamically imported so a scene's per-backend bundle pulls in only the one backend
// it renders on, not all four.
export async function createFunctionalTarget(options: FunctionalTargetOptions): Promise<FunctionalTarget> {
  const backend = (window as BackendWindow).__ftBackend ?? 'webgl';
  switch (backend) {
    case 'canvas':
      return (await import('./canvas')).createCanvasTarget(options);
    case 'dom':
      return (await import('./dom')).createDomTarget(options);
    case 'webgpu':
      return (await import('./webgpu')).createWgpuTarget(options);
    default:
      return (await import('./webgl')).createGlTarget(options);
  }
}
