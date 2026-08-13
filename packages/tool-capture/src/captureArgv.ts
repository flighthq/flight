// Argument validation for the capture CLI.
//
// The parser reads arguments by pulling the keys it knows out of argv, so an argument it does not know
// is simply never read. That silence is the hazard: nearly every flag on this tool narrows scope or
// changes measurement conditions (--filter, --renderer, --frames, --only, --retries,
// --regression-tolerance), so a misspelled flag does not fail loudly — it runs the whole suite at
// default tolerances while the operator believes they measured a narrow set under specific conditions,
// and nothing in the output says otherwise.
//
// This is the same class of wrong measurement the stale-build refusal in captureServer already guards
// ("This capture measures the PREVIOUS code, so a change under test will look like it had no effect").
// A run whose scope silently differs from the one requested is no more reportable than a run against
// stale code, so it gets the same treatment: refuse rather than measure the wrong thing quietly.

export function assertKnownCaptureFlags(argv: readonly string[]): void {
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    // A bare `--` is the argument separator (npm run … -- --filter=x), not a flag.
    if (argument === '--') continue;
    const key = argument.slice(2).split('=')[0]!;
    if (KNOWN_CAPTURE_FLAGS.has(key)) continue;
    throw new Error(
      `Unrecognized flag --${key}. This would otherwise be ignored silently and the run would measure ` +
        `something other than what was asked for.\nKnown flags: ${[...KNOWN_CAPTURE_FLAGS].sort().join(', ')}`,
    );
  }
}

// Every key the CLI reads through flag()/hasFlag(). One flat set rather than a per-command vocabulary:
// the commands share most of their options, and rejecting a real flag because it was paired with the
// wrong subcommand would trade a silent miss for a false refusal.
const KNOWN_CAPTURE_FLAGS: ReadonlySet<string> = new Set([
  'benchmark-reference',
  'build',
  'capture-timeout',
  'config',
  'dev',
  'dir',
  'fail-on-changed',
  'fail-on-error',
  'filter',
  'frames',
  'iterations',
  'manifest',
  'no-parity',
  'no-regression',
  'no-verify',
  'observe',
  'only',
  'out',
  'parallel',
  'parity-tolerance',
  'performance-tolerance',
  'regression-tolerance',
  'renderer',
  'report',
  'retries',
  'root',
  'sample-duration',
  'samples',
  'sequential',
  'stability-epsilon',
  'stability-tolerance',
  'subject',
  'subjects-parallel',
  'tool',
  'update-baseline',
  'update-benchmarks',
  'update-coverage',
  'update-fingerprints',
  'url',
  'verify',
  'wait',
  'warmup',
]);
