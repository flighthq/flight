/** A single structural issue reported by `validateSkeleton`. */
export interface SkeletonValidationDiagnostic {
  /** Number of joints in the skeleton. */
  jointCount: number;
  /** Actual length of `inverseBindMatrices` (should be `jointCount * 16`). */
  inverseBindMatricesLength: number;
  /** Length `inverseBindMatrices` must have to match the joint count (`jointCount * 16`). */
  expectedInverseBindMatricesLength: number;
  /** Human-readable description of the issue. */
  message: string;
}
