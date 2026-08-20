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

type BackendWindow = typeof window & {
  __ftAntialiasingPolicy?: 'aa' | 'no-aa';
  __ftBackend?: string;
  __ftExpectedImageDescription?: string;
  __ftExpectedImageDescriptionUnavailable?: string;
  __ftExpectedImageDescriptionWithheld?: string;
};

// A checked claim about the final reviewed picture, never a renderer setter. The repository gate owns
// declaration presence and sibling agreement; its report-only census independently resolves backend
// defaults and target normalization so a scene cannot make its own claim green by calling this.
export function declareAntialiasingPolicy(policy: 'aa' | 'no-aa'): void {
  (window as BackendWindow).__ftAntialiasingPolicy = policy;
}

export function declareExpectedImageDescription(description: string): void {
  (window as BackendWindow).__ftExpectedImageDescription = description;
}

// The scene CAN carry a description and we are choosing not to write one — a policy state, distinct from
// the capability state a scene without any declaration is in. Kuwahara is the case it was built for: the
// shader has a known bug, so describing what it currently draws would bless the defect as the
// specification, and a description written to match a broken render can never disagree with the renderer.
//
// It lives at the site, not in a register, because a register is a second source that drifts: fixing the
// shader means replacing this call with a real description and the counts move on their own, with nothing
// to remember. The reason is required for the same reason the description is — a withheld cell with no
// reason is indistinguishable from a forgotten one six weeks later.
export function declareExpectedImageDescriptionUnavailable(reason: string): void {
  (window as BackendWindow).__ftExpectedImageDescriptionUnavailable = reason;
}

export function declareExpectedImageDescriptionWithheld(reason: string): void {
  (window as BackendWindow).__ftExpectedImageDescriptionWithheld = reason;
}

// Each backend is dynamically imported so a scene's per-backend bundle pulls in only the one backend
// it renders on, not all four.
export async function createFunctionalTarget(options: FunctionalTargetOptions): Promise<FunctionalTarget> {
  if (options.expectedImageDescription !== undefined) {
    declareExpectedImageDescription(options.expectedImageDescription);
  }
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
