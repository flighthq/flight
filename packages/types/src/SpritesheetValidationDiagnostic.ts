/** Severity of a spritesheet validation diagnostic. */
export type SpritesheetValidationSeverity = 'error' | 'warning';
/** A single issue reported by `validateSpritesheet` or `validateSpritesheetData`. */
export interface SpritesheetValidationDiagnostic {
  /** Name of the animation this diagnostic is scoped to, or `null` for sheet-level issues. */
  animationName: string | null;
  /** Zero-based index of the frame this diagnostic is scoped to, or `null` for animation-level issues. */
  frameIndex: number | null;
  /** Human-readable description of the issue. */
  message: string;
  /** Whether the issue is fatal (data cannot be used safely) or a warning (data is usable with caveats). */
  severity: SpritesheetValidationSeverity;
}
