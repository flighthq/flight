import { logOnce } from '@flighthq/log/contract';
import type { Skeleton2DCoercedInterpolation, Skeleton2DDeformLengthMismatch } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSkeleton2DCoercedInterpolationGuard, setSkeleton2DDeformLengthGuard } from './skeleton2dGuards';

// Uninstalls the guards installed by enableSkeleton2DGuards.
export function disableSkeleton2DGuards(): void {
  setSkeleton2DCoercedInterpolationGuard(null);
  setSkeleton2DDeformLengthGuard(null);
}

/**
 * Installs the caller-facing skeleton guards (opt-in, dev-only). Idempotent.
 *
 * This package does two things that are **correct and invisible**, which is the combination worth
 * announcing. Neither is a bug to fix — coercing is right in both cases — but a coercion nobody can see
 * is indistinguishable from the file having been authored that way, so an author who set an easing and
 * never saw it take effect has no way to find out why.
 *
 * 1. **A non-blendable channel is walked as steps** whatever its track claims. An attachment index
 *    blended between two table entries names art that was never authored; a draw order blended between
 *    two orderings yields fractional sort keys and a sequence nobody wrote.
 * 2. **A deform offset stream whose length does not match the vertex stream it addresses is ignored.**
 *    There is no correct prefix to consume, so applying what fits would deform some vertices and leave
 *    others behind, and reading past the buffer is never an option.
 *
 * The messages live here rather than beside the code that knows the fact, so a shipped build that never
 * imports this module carries neither them nor `@flighthq/log`. Every case also has a `has*`/`explain*`
 * query for a caller that wants the fact as data instead of a log line.
 */
export function enableSkeleton2DGuards(): void {
  setSkeleton2DCoercedInterpolationGuard(warnOnCoercedInterpolation);
  setSkeleton2DDeformLengthGuard(warnOnDeformLengthMismatch);
}

function warnOnCoercedInterpolation(report: Readonly<Skeleton2DCoercedInterpolation>): void {
  logOnce(
    `skeleton2d:coerced-interpolation:${report.subject}`,
    LogLevel.Warn,
    {
      message: `A ${report.subject} channel states '${report.stated}' interpolation but is walked as '${report.applied}'. The value it carries cannot be blended — an attachment index between two table entries names art nobody authored, and a draw order between two orderings gives fractional sort keys — so the step is forced and the stated easing has no effect. Author the track as '${report.applied}' to say what actually happens, or drive a blendable property instead.`,
    },
    'skeleton2d',
  );
}

function warnOnDeformLengthMismatch(report: Readonly<Skeleton2DDeformLengthMismatch>): void {
  logOnce(
    `skeleton2d:deform-length:${report.subject}`,
    LogLevel.Warn,
    {
      message: `Deform offsets on '${report.subject}' carry ${report.offsets} values but the vertex stream they address needs ${report.addressed}. The offsets are ignored rather than partly applied: a stream of the wrong length has no correct prefix, so consuming what fits would deform some vertices and silently leave the rest in their setup pose. Re-export the attachment, or check that the deform timeline belongs to this attachment.`,
    },
    'skeleton2d',
  );
}
