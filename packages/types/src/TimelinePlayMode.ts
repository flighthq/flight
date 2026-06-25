// How a Timeline behaves when the playhead passes the last frame: 'loop' wraps back to frame 1,
// 'once' stops on the last frame and fires onComplete.
export type TimelinePlayMode = 'loop' | 'once';
