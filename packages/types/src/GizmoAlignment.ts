export type GizmoAlignment = 'bottom' | 'horizontal-center' | 'left' | 'right' | 'top' | 'vertical-center';

/** The closest vertical and horizontal smart guides for one moving bounds rectangle. */
export interface GizmoSmartGuideResult {
  deltaX: number;
  deltaY: number;
  guideX: number | null;
  guideY: number | null;
}
