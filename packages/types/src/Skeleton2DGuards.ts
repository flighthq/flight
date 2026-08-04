/**
 * What a channel's stated interpolation was replaced with, and why it had to be.
 *
 * Some channels carry a value that cannot be blended: an attachment index blended between two table
 * entries names art that was never authored, and a draw order blended between two orderings produces
 * fractional sort keys and a sequence nobody wrote. Those channels are walked as steps whatever their
 * track claims, which is correct — but a coercion nobody can see is indistinguishable from the file
 * having been authored that way, so the override is reported rather than performed in silence.
 */
export interface Skeleton2DCoercedInterpolation {
  /** What the channel is actually walked as. Always `Step` today; stated so a reader need not assume. */
  applied: string;
  /** What the track claimed, which is what the author most likely set. */
  stated: string;
  /** Which channel family coerced — `Attachment` or `DrawOrder`. */
  subject: string;
}

/**
 * A deform offset stream that does not match the vertex stream it addresses.
 *
 * The offsets are ignored rather than partially applied: a stream of the wrong length has no correct
 * prefix, so consuming what fits would deform some vertices and silently leave others behind. Reading
 * past the buffer is never an option, and this is a sentinel rather than a throw because a malformed
 * attachment is an asset fact.
 */
export interface Skeleton2DDeformLengthMismatch {
  /** How many values the addressed vertex stream needs. */
  addressed: number;
  /** How many the offset stream actually carries. */
  offsets: number;
  /** Which attachment or slot the mismatch was found on, for a caller that has to go and fix it. */
  subject: string;
}

/** Installed by `enableSkeleton2DGuards`; called when a channel's interpolation is overridden. */
export type Skeleton2DCoercedInterpolationGuard = (report: Readonly<Skeleton2DCoercedInterpolation>) => void;

/** Installed by `enableSkeleton2DGuards`; called when a deform offset stream is the wrong length. */
export type Skeleton2DDeformLengthGuard = (report: Readonly<Skeleton2DDeformLengthMismatch>) => void;
