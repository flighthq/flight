import type { MovieClip } from '@flighthq/types';

import { updateTimeline } from './timeline';

export function updateMovieClip(clip: MovieClip, deltaTime: number): void {
  if (clip.data.timeline === null) return;
  updateTimeline(clip.data.timeline, deltaTime);
}
