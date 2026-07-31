import { logOnce } from '@flighthq/log/contract';
import type { GlRenderEffectApplicationExplanation, GlRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setGlRenderEffectApplicationGuard } from './glRenderTextureEffect';

export function areGlRenderEffectGuardsEnabled(state: GlRenderState): boolean {
  return _guardedStates.has(state);
}

export function disableGlRenderEffectGuards(state: GlRenderState): void {
  setGlRenderEffectApplicationGuard(state, null);
  _guardedStates.delete(state);
}

// Installs diagnostics for the effect-chain sentinels that are indistinguishable from working code:
// an unregistered chain returns false having never written `dest`, so a sprite sampling that texture
// shows whatever was last in it, and a partially registered chain succeeds while silently dropping
// the effects it could not run. Both are correct by contract and neither surfaces anywhere.
export function enableGlRenderEffectGuards(state: GlRenderState): void {
  setGlRenderEffectApplicationGuard(state, warnGlRenderEffectApplication);
  _guardedStates.add(state);
}

function getGlRenderEffectApplicationMessage(explanation: Readonly<GlRenderEffectApplicationExplanation>): string {
  switch (explanation.status) {
    case 'partial-registration':
      return `applyGlRenderEffectsToRenderTexture: ${explanation.unregisteredKinds.length} of ${explanation.requestedCount} effect kinds have no registered runner and were SKIPPED — the destination was written without them; call registerGlRenderEffect(state, kind, runner) for ${explanation.unregisteredKinds.join(', ')}`;
    case 'source-unavailable':
      return 'applyGlRenderEffectsToRenderTexture: the source render Texture has no realized GL target, so the call returned false and the destination was NOT written — render into the source before applying effects';
    default:
      return `applyGlRenderEffectsToRenderTexture: no registered runner for any of ${explanation.unregisteredKinds.join(', ')}, so the call returned false and the destination was NEVER WRITTEN — anything sampling it reads a stale or empty texture; call registerGlRenderEffect(state, kind, runner)`;
  }
}

function warnGlRenderEffectApplication(
  _state: GlRenderState,
  explanation: Readonly<GlRenderEffectApplicationExplanation>,
): void {
  // Keyed by status plus the kinds involved: a chain missing a different effect is a different
  // observation worth reporting, while the same miss every frame is not.
  logOnce(
    `effects-gl:effect-application:${explanation.status}:${explanation.unregisteredKinds.join(',')}`,
    LogLevel.Warn,
    {
      message: getGlRenderEffectApplicationMessage(explanation),
      registeredCount: explanation.registeredCount,
      requestedCount: explanation.requestedCount,
      status: explanation.status,
      unregisteredKinds: explanation.unregisteredKinds,
    },
    'effects-gl',
  );
}

const _guardedStates = new WeakSet<GlRenderState>();
