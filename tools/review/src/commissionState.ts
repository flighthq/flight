export type ReviewCommissionState = 'included' | 'differs' | 'not-commissioned' | 'requested';

/** Explains why the reference pane has no image without conflating a queued request with no request. */
export function reviewMissingReferenceMessage(state: ReviewCommissionState): string {
  if (state === 'requested') return 'Request pending — no blessed reference image yet';
  if (state === 'included' || state === 'differs') {
    return 'No reference fetched yet — run npm run reference-image:fetch to extract the pack';
  }
  return 'No reference image — this cell is not commissioned';
}
