import type { AnimationChannel, Skeleton2DCoercedInterpolation } from '@flighthq/types/contract';

/**
 * Whether this channel's stated interpolation will be overridden, as plain data — the shakeable query
 * beside the guard's log line, for a caller that wants to check a whole clip before playing it rather
 * than watch warnings arrive during playback.
 *
 * Returns `null` when nothing is coerced, which is the common answer. `subject` names the channel
 * family the caller is about to bind the channel as, since the same track is only coerced by virtue of
 * what it drives: an identical `Linear` track is honoured on a bone and stepped on an attachment.
 */
export function explainSkeleton2DChannelInterpolation(
  channel: Readonly<AnimationChannel>,
  subject: string,
): Skeleton2DCoercedInterpolation | null {
  if (!isSkeleton2DSteppedChannelSubject(subject)) return null;
  const stated = channel.track.interpolation;
  if (stated === STEP_INTERPOLATION) return null;
  return { applied: STEP_INTERPOLATION, stated, subject };
}

/**
 * Whether a channel family carries a value that cannot be blended, and is therefore walked as steps
 * whatever its track states.
 *
 * Kept a query rather than a field on the target: it is a property of what the channel *drives*, not
 * of the channel, so a caller can ask before it has built a target at all.
 */
export function isSkeleton2DSteppedChannelSubject(subject: string): boolean {
  return subject === ATTACHMENT_SUBJECT || subject === DRAW_ORDER_SUBJECT;
}

// An attachment index blended between two table entries names art nobody authored; a draw order
// blended between two orderings gives fractional sort keys and a sequence nobody wrote.
const ATTACHMENT_SUBJECT = 'Attachment';
const DRAW_ORDER_SUBJECT = 'DrawOrder';
const STEP_INTERPOLATION = 'Step';
