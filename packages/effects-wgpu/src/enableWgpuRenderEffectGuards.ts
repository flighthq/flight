import { logOnce } from '@flighthq/log/contract';
import type { WgpuRenderEffectApplicationExplanation, WgpuRenderState } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import {
  setWgpuRenderEffectPipelineSampleCountGuard,
  setWgpuRenderEffectPipelineSkipGuard,
} from './wgpuRenderEffectPipeline';
import { setWgpuRenderEffectApplicationGuard } from './wgpuRenderTextureEffect';

export function areWgpuRenderEffectGuardsEnabled(state: WgpuRenderState): boolean {
  return _guardedStates.has(state);
}

export function disableWgpuRenderEffectGuards(state: WgpuRenderState): void {
  setWgpuRenderEffectApplicationGuard(state, null);
  setWgpuRenderEffectPipelineSampleCountGuard(state, null);
  setWgpuRenderEffectPipelineSkipGuard(state, null);
  _guardedStates.delete(state);
}

// Installs diagnostics for the effect-chain sentinels that are indistinguishable from working code: an
// unregistered chain returns false having never written `dest`, so a sprite sampling that texture shows
// whatever was last in it, and a partially registered chain succeeds while silently dropping the effects
// it could not run. Both are correct by contract and neither surfaces anywhere.
//
// The WGPU sibling of enableGlRenderEffectGuards, and deliberately narrower: GL additionally guards
// per-instance resolvability and re-registered custom-shader source, and WGPU has neither a resolver half
// to registration nor a custom-shader effect. Guarding what this backend cannot observe would be a
// warning that can never fire, so the absence is the honest shape rather than an oversight.
export function enableWgpuRenderEffectGuards(state: WgpuRenderState): void {
  setWgpuRenderEffectApplicationGuard(state, warnWgpuRenderEffectApplication);
  setWgpuRenderEffectPipelineSampleCountGuard(state, warnWgpuRenderEffectPipelineSampleCount);
  setWgpuRenderEffectPipelineSkipGuard(state, warnWgpuRenderEffectPipelineSkip);
  _guardedStates.add(state);
}

// WGPU effect targets are single-sample today, but 102 live scene/example callers request 4 samples.
// Rejecting made every one of those module-scope callers unloadable; accepting without this observation
// hid that the requested capability was absent. Warn once per requested count and continue with 1.
function warnWgpuRenderEffectPipelineSampleCount(
  _state: WgpuRenderState,
  requestedSampleCount: number,
  appliedSampleCount: number,
): void {
  logOnce(
    `effects-wgpu:pipeline-sample-count-degraded:${requestedSampleCount}`,
    LogLevel.Warn,
    {
      appliedSampleCount,
      message: `createWgpuRenderEffectPipeline: sampleCount ${requestedSampleCount} requested, but WGPU effect targets support 1 or 4 — continuing with sampleCount ${appliedSampleCount}`,
      requestedSampleCount,
    },
    'effects-wgpu',
  );
}

function getWgpuRenderEffectApplicationMessage(explanation: Readonly<WgpuRenderEffectApplicationExplanation>): string {
  switch (explanation.status) {
    case 'partial-registration':
      return `applyWgpuRenderEffectsToRenderTexture: ${explanation.unregisteredKinds.length} of ${explanation.requestedCount} effect kinds have no registered runner and were SKIPPED — the destination was written without them; call registerWgpuRenderEffect(state, kind, runner) for ${explanation.unregisteredKinds.join(', ')}`;
    case 'source-unavailable':
      return 'applyWgpuRenderEffectsToRenderTexture: the source render Texture has no realized WGPU target, so the call returned false and the destination was NOT written — render into the source before applying effects';
    case 'stale-destination':
      return 'applyWgpuRenderEffectsToRenderTexture: the call returned false before replacing the destination, so its previously published pixels are a STALE DESTINATION — handle the false return before sampling dest, and make the source and runners available before retrying';
    default:
      return `applyWgpuRenderEffectsToRenderTexture: no registered runner for any of ${explanation.unregisteredKinds.join(', ')}, so the call returned false and the destination was NEVER WRITTEN — anything sampling it reads a stale or empty texture; call registerWgpuRenderEffect(state, kind, runner)`;
  }
}

function warnWgpuRenderEffectApplication(
  _state: WgpuRenderState,
  explanation: Readonly<WgpuRenderEffectApplicationExplanation>,
): void {
  // Keyed by status plus the kinds involved: a chain missing a different effect is a different
  // observation worth reporting, while the same miss every frame is not.
  logOnce(
    `effects-wgpu:effect-application:${explanation.status}:${explanation.unregisteredKinds.join(',')}`,
    LogLevel.Warn,
    {
      message: getWgpuRenderEffectApplicationMessage(explanation),
      registeredCount: explanation.registeredCount,
      requestedCount: explanation.requestedCount,
      status: explanation.status,
      unregisteredKinds: explanation.unregisteredKinds,
    },
    'effects-wgpu',
  );
}

// A pipeline pass drops an effect whose kind has no runner with a bare `continue`: no draw, no error, no
// artifact. Seven effect kinds ship a descriptor and a constructor with no runner on ANY backend
// (AutoExposure, BarrelDistortion, FilmEmulation, PanniniProjection, Ssr, Taa, VolumetricLight), so a
// caller can build one into a chain and watch nothing happen with nothing to grep for.
function warnWgpuRenderEffectPipelineSkip(_state: WgpuRenderState, kind: string): void {
  // Keyed by kind, not by frame: the same missing kind every frame is one observation, and a second kind
  // going missing is a new one worth reporting.
  logOnce(
    `effects-wgpu:pipeline-effect-skipped:${kind}`,
    LogLevel.Warn,
    {
      kind,
      message: `endWgpuRenderEffectPipeline: effect kind "${kind}" has no registered runner, so the pass was SKIPPED — the frame was written without it and nothing else reports this; call registerWgpuRenderEffect(state, "${kind}", runner), or check whether this kind has a runner on this backend at all`,
    },
    'effects-wgpu',
  );
}

const _guardedStates = new WeakSet<WgpuRenderState>();
