import { easeCubicBezier } from '@flighthq/easing/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Bone2D, EasingFunction, ImportDiagnostic, Slot2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

// Converts Spine's per-keyframe bezier `curve` arrays into one `EasingFunction` per INTERVAL, which is the
// shape `AnimationTrack.segmentEasings` takes (entry i reshapes the alpha of the segment from key i to
// i+1). Returns `null` when no interval carries a curve, so an uncurved timeline allocates nothing.
//
// Spine writes the control points in ABSOLUTE time/value units — not normalized — and writes FOUR numbers
// PER COMPONENT, in component order (a 1-component `rotate` carries 4, a 2-component `translate` carries 8).
// So each control point is rebased onto the segment to get the unit-square curve `easeCubicBezier` wants:
// `x = (cx − t1) / (t2 − t1)` and `y = (cy − v1) / (v2 − v1)`.
//
// PER-COMPONENT DIVERGENCE. Spine permits a different curve per component, but a Flight track carries one
// easing per interval, so the FIRST component's curve wins and a divergence is Skip-crumbed rather than
// silently dropped [decision 2026-07-30]. Divergence is measured on the NORMALIZED control points, not the
// raw numbers: two components with the same curve shape but different value ranges write different raw
// `cy`s, so a raw comparison would report divergence on essentially every multi-component timeline.
// A component whose value does not change across the segment is skipped when picking the winner — its
// curve carries no shape (the rebase would divide by zero) — so "first" means first MEANINGFUL component.
export function buildSpineSegmentEasings(
  keys: readonly Readonly<Record<string, unknown>>[],
  times: readonly number[],
  values: readonly number[],
  components: number,
  diagnostics?: ImportDiagnostic[],
): (EasingFunction | null)[] | null {
  const segments = times.length - 1;
  if (segments < 1) return null;
  const easings: (EasingFunction | null)[] = [];
  let curved = false;
  let clampedSegments = 0;
  let divergentSegments = 0;
  for (let i = 0; i < segments; i++) {
    const curve = keys[i].curve;
    const span = times[i + 1] - times[i];
    if (!Array.isArray(curve) || span <= 0) {
      easings.push(null);
      continue;
    }
    // Pick the component with the LARGEST value change to supply the easing. The rebase divides by that
    // change, so a near-constant component is a near-zero denominator: it amplifies ordinary float noise
    // into control points far outside the unit square and yields a curve that is not the authored shape at
    // all. Choosing the dominant component is both the numerically stable option and the honest one — it is
    // the channel that actually carries the segment's motion.
    let winner = -1;
    let widest = 0;
    for (let c = 0; c < components && (c + 1) * 4 <= curve.length; c++) {
      const rise = Math.abs(values[(i + 1) * components + c] - values[i * components + c]);
      if (rise > widest) {
        widest = rise;
        winner = c;
      }
    }
    // The winner's control points are resolved FIRST, then every other component is compared against them.
    // Comparing inside a single pass would measure components that precede the winner against zeros.
    const rebase = (c: number): [number, number, number, number] | null => {
      const from = values[i * components + c];
      const rise = values[(i + 1) * components + c] - from;
      if (rise === 0) return null;
      const offset = c * 4;
      return [
        (numberOr(curve[offset], 0) - times[i]) / span,
        (numberOr(curve[offset + 1], 0) - from) / rise,
        (numberOr(curve[offset + 2], 0) - times[i]) / span,
        (numberOr(curve[offset + 3], 0) - from) / rise,
      ];
    };
    const won = winner < 0 ? null : rebase(winner);
    let diverged = false;
    if (won !== null) {
      for (let c = 0; c < components && (c + 1) * 4 <= curve.length; c++) {
        if (c === winner) continue;
        const other = rebase(c);
        if (other === null) continue;
        for (let k = 0; k < 4; k++) {
          if (Math.abs(other[k] - won[k]) > SPINE_CURVE_EPSILON) diverged = true;
        }
      }
    }
    const chosen = won !== null;
    const x1 = won === null ? 0 : won[0];
    const y1 = won === null ? 0 : won[1];
    const x2 = won === null ? 0 : won[2];
    const y2 = won === null ? 0 : won[3];
    if (diverged) divergentSegments++;
    if (chosen) {
      curved = true;
      // Spine lets a control point sit OUTSIDE its segment in time, which a CSS-style cubic bezier cannot
      // represent: `easeCubicBezier` inverts x→parameter, and that inversion is only well defined while x
      // stays monotonic over [0,1]. So the x components are clamped and the loss is recorded. The y
      // components are deliberately left unclamped — a y outside [0,1] is legitimate overshoot/anticipation
      // and the solver handles it, since y is the output value rather than the thing being inverted.
      const clampedX1 = clampUnit(x1);
      const clampedX2 = clampUnit(x2);
      if (clampedX1 !== x1 || clampedX2 !== x2) clampedSegments++;
      easings.push(easeCubicBezier(clampedX1, y1, clampedX2, y2));
    } else {
      easings.push(null);
    }
  }
  if (clampedSegments > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'spine.curve-time-overshoot-clamped',
      'buildSpineSegmentEasings',
      { segments: clampedSegments },
    );
  }
  if (divergentSegments > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.per-component-curve-easing-unsupported',
      'buildSpineSegmentEasings',
      { segments: divergentSegments },
    );
  }
  return curved ? easings : null;
}

export function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function indexOfBone(bones: readonly Bone2D[], name: string): number {
  for (let i = 0; i < bones.length; i++) {
    if (bones[i].name === name) return i;
  }
  return -1;
}

export function indexOfSpineSlot(slots: readonly Slot2D[], name: string): number {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].name === name) return i;
  }
  return -1;
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function parseSpineColor(value: unknown): number {
  if (typeof value !== 'string' || value.length !== 8) return 0xffffffff;
  const parsed = Number.parseInt(value, 16);
  return Number.isNaN(parsed) ? 0xffffffff : parsed >>> 0;
}

export function skipCrumbSpineTimelineGroup(
  diagnostics: ImportDiagnostic[] | undefined,
  raw: unknown,
  kind: string,
): void {
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (raw !== null && typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0)
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseSpineAnimations', { count });
}

const SPINE_CURVE_EPSILON = 1e-6;

export const SPINE_DEFAULT_SKIN_NAME = 'default';

export const SPINE_NO_ATTACHMENT_INDEX = -1;
