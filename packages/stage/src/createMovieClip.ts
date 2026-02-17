import type { MovieClip } from '@flighthq/types';

import { createSprite } from './createSprite';

export function createMovieClip(obj: Partial<MovieClip> = {}): MovieClip {
  return createSprite(obj);
}
