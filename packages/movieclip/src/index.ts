export * from './enableMovieClipGuards.ts';
export {
  addMovieClipFrameScript,
  createMovieClip,
  disposeMovieClipSignals,
  enableMovieClipSignals,
  getMovieClipCurrentFrame,
  getMovieClipCurrentLabel,
  getMovieClipFrameScript,
  getMovieClipSignals,
  getMovieClipTotalFrames,
  gotoAndPlayMovieClip,
  gotoAndStopMovieClip,
  isMovieClipPlaying,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  removeMovieClipFrameScript,
  setMovieClipSource,
  stopMovieClip,
  updateMovieClip,
} from './movieClip.ts';
export { createSpritesheetTimelineSource, explainSpritesheetTimelineSource } from './spritesheetTimelineSource.ts';
export type {
  SpritesheetTimelineSourceExplanation,
  SpritesheetTimelineSourceGuard,
  SpritesheetTimelineSourceUnsupportedField,
} from './spritesheetTimelineSource.ts';
