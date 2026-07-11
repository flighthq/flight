// The kind of problem validateAnimationTrack found. 'nonAscendingTimes' means a keyframe time is not
// strictly greater than its predecessor; 'valuesLengthMismatch' means the flat `values` buffer length
// does not equal keyCount * componentsPerKeyframe (components for step/linear, 3 * components for cubic).
export type AnimationTrackValidationCode = 'nonAscendingTimes' | 'valuesLengthMismatch';

// A single structural issue reported by validateAnimationTrack. `index` is the offending keyframe index
// for time-ordering issues, or null for whole-buffer issues.
export interface AnimationTrackValidationDiagnostic {
  code: AnimationTrackValidationCode;
  index: number | null;
  message: string;
}
