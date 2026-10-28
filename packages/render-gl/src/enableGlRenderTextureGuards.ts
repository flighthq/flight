import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import type { GlContext, GlRenderState, GlRenderTextureExplanation, RenderTexture } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setGlRenderTextureGuard } from './glRenderTexture.ts';

export function areGlRenderTextureGuardsEnabled(state: GlRenderState): boolean {
  let enabled = false;
  setGlRenderTextureGuardProbe(state, () => {
    enabled = true;
  });
  return enabled;
}

// Installs diagnostics for the two silent sentinel cases: sampling before the first completed
// renderInto, and sampling the same attachment while it is bound for writing.
export function enableGlRenderTextureGuards(state: GlRenderState, logState: LogState | null): void {
  _guardLogStates.set(state, logState);
  setGlRenderTextureGuard(state, warnGlRenderTextureUnavailable);
  _guardedContexts.add(state.gl);
}

function setGlRenderTextureGuardProbe(state: GlRenderState, onEnabled: () => void): void {
  if (_guardedContexts.has(state.gl)) onEnabled();
}

function warnGlRenderTextureUnavailable(
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<GlRenderTextureExplanation>,
): void {
  const logState = _guardLogStates.get(state) ?? null;
  if (logState === null) return;
  const writing = explanation.status === 'writing';
  // The render guards take no clock, so the warning is stamped at time zero.
  logOnce(
    logState,
    0,
    `render-gl:render-texture-${explanation.status}`,
    LogLevel.Warn,
    {
      height: explanation.height,
      message: writing
        ? 'bindGlRenderTexture: the render Texture is still bound for writing; sampling it would be a read-after-write feedback hazard.'
        : 'bindGlRenderTexture: the render Texture has not completed renderIntoGlRenderTexture; sampling uses the empty sentinel.',
      renderTexture,
      status: explanation.status,
      width: explanation.width,
    },
    'render-gl',
  );
}

const _guardedContexts = new WeakSet<GlContext>();
// The caller-owned log state each render state's guard reports to; null installs it silently.
const _guardLogStates = new WeakMap<GlRenderState, LogState | null>();
