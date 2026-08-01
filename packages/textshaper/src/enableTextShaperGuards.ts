import { logOnce } from '@flighthq/log/contract';
import type { ShapedRun } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setShapedRunReleaseGuard } from './textShaperPool';

/** Uninstalls the guard installed by `enableTextShaperGuards`. */
export function disableTextShaperGuards(): void {
  setShapedRunReleaseGuard(null);
}

/**
 * Installs the caller-facing shaped-run pool guard (opt-in, dev-only). `acquireShapedRun` and
 * `releaseShapedRun` are paired brackets: each acquired run must be released exactly once and must not
 * be used afterwards. Core already ignores a repeated release to preserve the pool invariant, but that
 * silent recovery otherwise hides the caller bug that unbalanced the bracket.
 *
 * The guard warns once through `@flighthq/log`. Not importing this module costs production nothing: the
 * message and logging dependency live only here, while the pool keeps a null callback by default.
 */
export function enableTextShaperGuards(): void {
  setShapedRunReleaseGuard(warnOnDoubleRelease);
}

function warnOnDoubleRelease(_run: Readonly<ShapedRun>): void {
  logOnce(
    'textshaper:double-release',
    LogLevel.Warn,
    {
      message:
        'releaseShapedRun: this run is already in the pool, so it is being released twice. The repeated release was ignored to preserve the pool, but it indicates an unbalanced bracket. Every acquireShapedRun call must pair with exactly one releaseShapedRun call, and the run must not be used after release.',
    },
    'textshaper',
  );
}
