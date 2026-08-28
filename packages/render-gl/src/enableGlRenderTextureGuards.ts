import { logOnce } from '@flighthq/log/contract';
import type { GlContext, GlRenderState, GlRenderTextureExplanation, RenderTexture } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setGlRenderTextureGuard } from './glRenderTexture';

export function areGlRenderTextureGuardsEnabled(state: GlRenderState): boolean {
  let enabled = false;
  setGlRenderTextureGuardProbe(state, () => {
    enabled = true;
  });
  return enabled;
}

// Installs diagnostics for the two silent sentinel cases: sampling before the first completed
// renderInto, and sampling the same attachment while it is bound for writing.
export function enableGlRenderTextureGuards(state: GlRenderState): void {
  setGlRenderTextureGuard(state, warnGlRenderTextureUnavailable);
  _guardedContexts.add(state.gl);
}

function setGlRenderTextureGuardProbe(state: GlRenderState, onEnabled: () => void): void {
  if (_guardedContexts.has(state.gl)) onEnabled();
}

function warnGlRenderTextureUnavailable(
  _state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<GlRenderTextureExplanation>,
): void {
  const writing = explanation.status === 'writing';
  logOnce(
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
