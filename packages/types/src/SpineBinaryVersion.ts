import type { ImportDiagnostic } from './ImportDiagnostic';
import type { Skeleton2DImport } from './Skeleton2DImport';

/**
 * A complete parser for ONE Spine binary wire layout, keyed into the version registry by its
 * `major.minor` string.
 *
 * Every registered parser is self-contained: it validates the version it was handed and refuses a file
 * whose layout it does not describe, so calling a leaf directly is as safe as going through the registry.
 * That is what makes the leaves independently importable — a caller who knows their export version pays
 * for one layout and neither the probe nor the other versions.
 */
export type SpineBinaryParser = (
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
) => Skeleton2DImport | null;

/**
 * Why `getSpineBinaryVersion` returned `null`.
 *
 * The accessor is a silent sentinel by design; this is its shakeable `explain*` companion, returning plain
 * data rather than a message. The three reasons are genuinely different situations and a caller can act on
 * the difference: `too-short` is a truncated or empty file, `no-strategy-matched` means neither header
 * layout produced something version-shaped (most likely not a Spine binary at all), and `strategies-disagree`
 * means both produced a plausible version — which cannot happen on the corpus and would mean the
 * discrimination itself has stopped being sound.
 */
export type SpineBinaryVersionFailureReason = 'no-strategy-matched' | 'strategies-disagree' | 'too-short';

export interface SpineBinaryVersionFailure {
  /** The file length, so a truncation is legible without re-reading the input. */
  readonly bytes: number;
  reason: SpineBinaryVersionFailureReason;
  /** What the 3.x strategy produced, or null when it did not yield a version-shaped string. */
  readonly v3Candidate: string | null;
  /** What the 4.x strategy produced, or null when it did not yield a version-shaped string. */
  readonly v4Candidate: string | null;
}
