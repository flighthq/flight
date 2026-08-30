import { logOnce } from '@flighthq/log/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import type { GlRenderState, Renderable, RenderState } from '@flighthq/types/contract';
import { LogLevel, RegistryEntryState } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function areGlRenderStateGuardsEnabled(state: GlRenderState): boolean {
  const entry = getRenderStateRuntime(state).registries.renderRootGuard?.entry;
  return entry?.state === RegistryEntryState.Bound && entry.value === warnOnSecondRenderRoot;
}

// Installs the GL pipeline-policy guard. A render state derives proxy transforms relative to one root;
// preparing another root on that state can reuse stale relative transforms. Give each independently
// rendered root its own createGlOffscreenRenderState-derived state.
export function enableGlRenderStateGuards(state: GlRenderState): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.renderRootGuard ?? createSlotTable('RenderRootGuard', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== warnOnSecondRenderRoot) {
    runtime.registries.renderRootGuard = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: warnOnSecondRenderRoot },
    };
  }
  getGlRenderStateRuntime(state).bindingCacheGuard = warnOnForeignGlBinding;
}

// render-gl skips a redundant `useProgram` by trusting its cached binding slot, which is sound only
// while render-gl is the sole writer of GL state on the context. A sibling renderer issuing raw GL —
// scene3d-gl's mesh, skybox, shadow and IBL passes all call `gl.useProgram` directly — invalidates that
// assumption, and `invalidateGlRenderStateCache` is the contract for restoring it.
//
// Verified here by asking GL what is ACTUALLY bound. That is a synchronous driver query and far too
// expensive for a draw path, which is exactly why it lives behind an opt-in guard rather than in the
// skip itself. Without it the first symptom is a GL error raised against a later uniform call, blaming
// render-gl for a binding some other renderer changed.
function warnOnForeignGlBinding(state: GlRenderState, expectedProgram: WebGLProgram): void {
  const actual = state.gl.getParameter(state.gl.CURRENT_PROGRAM) as WebGLProgram | null;
  if (actual === expectedProgram) return;
  logOnce(
    'render-gl:foreign-gl-binding',
    LogLevel.Warn,
    {
      message:
        'useGlProgram: the GL program actually bound is not the one render-gl cached, so a guest renderer ' +
        'wrote GL state without restoring it. Call invalidateGlRenderStateCache(state) before returning ' +
        'control to render-gl, or the next draw skips a bind it needs and GL rejects a later uniform.',
      state,
    },
    'render-gl',
  );
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
        'prepareScene2DRender: one GlRenderState was used for multiple roots — create a dedicated state with createGlOffscreenRenderState(contextState, pipeline)',
      root,
      state,
    },
    'render-gl',
  );
}

const _firstRoots = new WeakMap<GlRenderState, Renderable>();
