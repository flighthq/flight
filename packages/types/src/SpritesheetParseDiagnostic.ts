export type SpritesheetParseDiagnosticSeverity = 'error' | 'warning';
export interface SpritesheetParseDiagnostic {
  /** Name of the specific frame, if the diagnostic is frame-scoped. */
  frameName?: string;
  /** Name of the specific field, if the diagnostic is field-scoped. */
  field?: string;
  /** Human-readable description of the issue. */
  message: string;
  /** Whether this is a hard error (data may be incomplete) or a warning (data was recovered). */
  severity: SpritesheetParseDiagnosticSeverity;
}
