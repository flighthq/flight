import { logOnce } from '@flighthq/log/contract';
import type { GlRenderEffectApplicationExplanation, GlRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setGlCustomShaderSourceGuard } from './glCustomShaderEffect';
import { setGlRenderEffectPipelineSkipGuard } from './glRenderEffectPipeline';
import { setGlRenderEffectApplicationGuard } from './glRenderTextureEffect';

export function areGlRenderEffectGuardsEnabled(state: GlRenderState): boolean {
  return _guardedStates.has(state);
}

export function disableGlRenderEffectGuards(state: GlRenderState): void {
  setGlRenderEffectApplicationGuard(state, null);
  setGlCustomShaderSourceGuard(state, null);
  setGlRenderEffectPipelineSkipGuard(state, null);
  _guardedStates.delete(state);
}

// Installs diagnostics for the effect-chain sentinels that are indistinguishable from working code:
// an unregistered chain returns false having never written `dest`, so a sprite sampling that texture
// shows whatever was last in it, and a partially registered chain succeeds while silently dropping
// the effects it could not run. Both are correct by contract and neither surfaces anywhere.
export function enableGlRenderEffectGuards(state: GlRenderState): void {
  setGlRenderEffectApplicationGuard(state, warnGlRenderEffectApplication);
  setGlCustomShaderSourceGuard(state, warnGlCustomShaderSourceReregistered);
  setGlRenderEffectPipelineSkipGuard(state, warnGlRenderEffectPipelineSkip);
  _guardedStates.add(state);
}

// Re-registering different source under a live shaderKey leaves the ALREADY-COMPILED program running,
// because the program cache is keyed by shaderKey rather than by source. Nothing fails: the effect
// still draws, using the old shader, so an author editing their shader sees their edit have no effect
// and has no way to tell that from the edit being wrong.
function warnGlCustomShaderSourceReregistered(
  _state: GlRenderState,
  shaderKey: string,
  _previousSource: string,
  _nextSource: string,
): void {
  // Keyed by shaderKey: the same key re-registered every frame is one observation, while a second key
  // hitting the same trap is a new one worth reporting.
  logOnce(
    `effects-gl:custom-shader-source-reregistered:${shaderKey}`,
    LogLevel.Warn,
    {
      message: `registerGlCustomShaderSource: shaderKey "${shaderKey}" already held DIFFERENT source, and the compiled program is cached by key — the new source will NOT run and the effect keeps drawing with the old one; register edited source under a new key and point the effect at it`,
      shaderKey,
    },
    'effects-gl',
  );
}

function getGlRenderEffectApplicationMessage(explanation: Readonly<GlRenderEffectApplicationExplanation>): string {
  switch (explanation.status) {
    case 'partial-registration':
      return `applyGlRenderEffectsToRenderTexture: ${explanation.unregisteredKinds.length} of ${explanation.requestedCount} effect kinds have no registered runner and were SKIPPED — the destination was written without them; call registerGlRenderEffect(state, kind, runner) for ${explanation.unregisteredKinds.join(', ')}`;
    case 'source-unavailable':
      return 'applyGlRenderEffectsToRenderTexture: the source render Texture has no realized GL target, so the call returned false and the destination was NOT written — render into the source before applying effects';
    case 'partial-resolution':
      return `applyGlRenderEffectsToRenderTexture: ${explanation.unresolvedIndexes.length} of ${explanation.requestedCount} effects have a runner but nothing to run with, so those stages COPIED THE INPUT THROUGH UNCHANGED — they were not dropped and the destination WAS written; chain position(s) ${explanation.unresolvedIndexes.join(', ')} name something unregistered, such as a shaderKey with no registerGlCustomShaderSource call`;
    case 'stale-destination':
      return 'applyGlRenderEffectsToRenderTexture: the call returned false before replacing the destination, so its previously published pixels are a STALE DESTINATION — handle the false return before sampling dest, and make the source and runners available before retrying';
    case 'unresolved-effects':
      return `applyGlRenderEffectsToRenderTexture: every effect has a runner but NONE can resolve what it names, so the whole chain COPIED THE INPUT THROUGH UNCHANGED — the call returned true and the destination WAS written, which looks like effects that did nothing rather than effects that failed; chain position(s) ${explanation.unresolvedIndexes.join(', ')} name something unregistered, such as a shaderKey with no registerGlCustomShaderSource call`;
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
    `effects-gl:effect-application:${explanation.status}:${explanation.unregisteredKinds.join(',')}:${explanation.unresolvedIndexes.join(',')}`,
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

// A pipeline pass drops an effect whose kind has no runner with a bare `continue`: no draw, no error,
// no artifact. Seven effect kinds ship a descriptor and a constructor with no runner on ANY backend
// (AutoExposure, BarrelDistortion, FilmEmulation, PanniniProjection, Ssr, Taa, VolumetricLight), so a
// caller can build one into a chain and watch nothing happen with nothing to grep for.
function warnGlRenderEffectPipelineSkip(_state: GlRenderState, kind: string): void {
  // Keyed by kind, not by frame: the same missing kind every frame is one observation, and a second
  // kind going missing is a new one worth reporting.
  logOnce(
    `effects-gl:pipeline-effect-skipped:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message: `endGlRenderEffectPipeline: effect kind "${kind}" has no registered runner, so the pass was SKIPPED — the frame was written without it and nothing else reports this; call registerGlRenderEffect(state, "${kind}", runner), or check whether this kind has a runner on this backend at all`,
    },
    'effects-gl',
  );
}

const _guardedStates = new WeakSet<GlRenderState>();
