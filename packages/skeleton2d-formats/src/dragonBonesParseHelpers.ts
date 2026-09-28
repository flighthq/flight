import { easeCubicBezier } from '@flighthq/easing/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { AnimationInterpolation, EasingFunction, ImportDiagnostic } from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  ImportDiagnosticSeverity,
} from '@flighthq/types/contract';

export function buildDragonBonesSegmentEasings(
  frames: readonly Readonly<Record<string, unknown>>[],
): (EasingFunction | null)[] | null {
  const segments = frames.length - 1;
  if (segments < 1) return null;
  const easings: (EasingFunction | null)[] = [];
  let curved = false;
  for (let i = 0; i < segments; i++) {
    const curve = frames[i].curve;
    if (!Array.isArray(curve) || curve.length < 4) {
      easings.push(null);
      continue;
    }
    curved = true;
    easings.push(
      easeCubicBezier(
        clampDragonBonesUnit(numberOr(curve[0], 0)),
        numberOr(curve[1], 0),
        clampDragonBonesUnit(numberOr(curve[2], 1)),
        numberOr(curve[3], 1),
      ),
    );
  }
  return curved ? easings : null;
}

export function dragonBonesFrames(raw: unknown, diagnostics?: ImportDiagnostic[]): Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(raw)) return [];
  const frames: Readonly<Record<string, unknown>>[] = [];
  let recovered = 0;
  for (const entry of raw) {
    if (entry !== null && typeof entry === 'object') {
      frames.push(entry as Record<string, unknown>);
    } else {
      frames.push(EMPTY_DRAGONBONES_FRAME);
      recovered++;
    }
  }
  if (recovered > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'dragonbones.malformed-frame-recovered',
      'dragonBonesFrames',
      { frames: recovered },
    );
  }
  return frames;
}

export function dragonBonesFrameTimes(
  frames: readonly Readonly<Record<string, unknown>>[],
  frameRate: number,
): number[] {
  const times: number[] = [];
  let elapsedFrames = 0;
  for (const frame of frames) {
    times.push(elapsedFrames / frameRate);
    elapsedFrames += Math.max(0, numberOr(frame.duration, 1));
  }
  return times;
}

export function dragonBonesInterpolation(
  frames: readonly Readonly<Record<string, unknown>>[],
  diagnostics?: ImportDiagnostic[],
): AnimationInterpolation {
  let stepped = true;
  let approximated = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const frame = frames[i];
    if (!isDragonBonesFrameStepped(frame)) stepped = false;
    if (!('curve' in frame)) {
      const easing = frame.tweenEasing;
      if (typeof easing === 'number' && easing !== 0 && easing !== DRAGONBONES_NO_TWEEN) approximated++;
    }
  }
  if (approximated > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'dragonbones.tween-easing-approximated',
      'dragonBonesInterpolation',
      { frames: approximated },
    );
  }
  return stepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function parseDragonBonesBoneTransform(raw: unknown): {
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearY: number;
  x: number;
  y: number;
} {
  const t = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let rotation: number;
  let shearY: number;
  if ('rotate' in t || 'skew' in t) {
    rotation = numberOr(t.rotate, 0);
    shearY = numberOr(t.skew, 0);
  } else {
    rotation = numberOr(t.skY, 0);
    shearY = numberOr(t.skX, 0) - rotation;
  }
  return {
    rotation,
    scaleX: numberOr(t.scX, 1),
    scaleY: numberOr(t.scY, 1),
    shearY,
    x: numberOr(t.x, 0),
    y: numberOr(t.y, 0),
  };
}

export function skipCrumbDragonBonesGroup(
  diagnostics: ImportDiagnostic[] | undefined,
  raw: unknown,
  kind: string,
): void {
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (raw !== null && typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0)
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseDragonBonesSkeleton', { count });
}

function clampDragonBonesUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function isDragonBonesFrameStepped(frame: Readonly<Record<string, unknown>>): boolean {
  if ('curve' in frame) return false;
  if (!('tweenEasing' in frame)) return false;
  const easing = frame.tweenEasing;
  return easing === null || easing === DRAGONBONES_NO_TWEEN;
}

const DRAGONBONES_NO_TWEEN = 100;

const EMPTY_DRAGONBONES_FRAME: Readonly<Record<string, unknown>> = {};
