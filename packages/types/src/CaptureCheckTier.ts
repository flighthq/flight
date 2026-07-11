/**
 * The three render-verification tiers, each with a distinct meaning:
 *
 * - `regression` — one target compared against its own known committed baseline.
 * - `parity` — consistency between render backends rendering the same scene in the same run (no
 *   committed baseline; environment-independent).
 * - `smoke` — builds, runs, no error, not blank. Lives in the tools, listed here so the vocabulary is
 *   complete.
 */
export type CaptureCheckTier = 'regression' | 'parity' | 'smoke';
