import { logOnce } from '@flighthq/log/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import type { GlRenderState, Renderable, RenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

export function areGlRenderStateGuardsEnabled(state: GlRenderState): boolean {
  return getRenderStateRuntime(state).renderRootGuard === warnOnSecondRenderRoot;
}

// Installs the GL pipeline-policy guard. A render state derives proxy transforms relative to one root;
// preparing another root on that state can reuse stale relative transforms. Give each independently
// rendered root its own createGlOffscreenRenderState-derived state.
export function enableGlRenderStateGuards(state: GlRenderState): void {
  getRenderStateRuntime(state).renderRootGuard = warnOnSecondRenderRoot;
}

function warnOnSecondRenderRoot(state: RenderState, root: Renderable): void {
  const glState = state as GlRenderState;
  const previous = _firstRoots.get(glState);
  if (previous === undefined) {
    _firstRoots.set(glState, root);
    return;
  }
  if (previous === root) return;
  logOnce(
    'render-gl:multiple-roots-one-state',
    LogLevel.Warn,
    {
      firstRoot: previous,
      message:
        'prepareScene2DRender: one GlRenderState was used for multiple roots — derive a dedicated pipeline with createGlOffscreenRenderState(screenState)',
      root,
      state,
    },
    'render-gl',
  );
}

const _firstRoots = new WeakMap<GlRenderState, Renderable>();
