import {
  createMovieClip,
  getMovieClipCurrentFrame,
  isMovieClipPlaying,
  playMovieClip,
  setMovieClipSource,
} from '@flighthq/movieclip/contract';
import type { MovieClip, Node2D } from '@flighthq/types/contract';

import { readSwfFrameActions } from './swfFrameAction';
import { SwfReader } from './swfReader';

describe('readSwfFrameActions', () => {
  it('recognizes a stop and binds it to the clip that runs it', () => {
    const script = readSwfFrameActions(actions([0x07]));
    const clip = threeFrameClip();
    // Binding a source seeks and stops, so playback has to be started before a stop can be observed.
    playMovieClip(clip);
    expect(isMovieClipPlaying(clip)).toBe(true);

    script!(clip as Node2D, 1);
    expect(isMovieClipPlaying(clip)).toBe(false);
  });

  it('recognizes the goto-then-stop pair a gotoAndStop compiles to', () => {
    // ActionGotoFrame carries a zero-based frame, so 2 means frame 3; the trailing stop is what decides
    // that playback does not continue from there.
    const script = readSwfFrameActions(actions([0x81, 0x02, 0x00, 0x02, 0x00, 0x07]));
    const clip = threeFrameClip();

    script!(clip as Node2D, 1);
    expect(getMovieClipCurrentFrame(clip)).toBe(3);
    expect(isMovieClipPlaying(clip)).toBe(false);
  });

  it('recognizes a goto by label', () => {
    const script = readSwfFrameActions(actions([0x8c, 0x04, 0x00, 0x65, 0x6e, 0x64, 0x00]));
    const clip = threeFrameClip([{ frame: 3, name: 'end' }]);

    script!(clip as Node2D, 1);
    expect(getMovieClipCurrentFrame(clip)).toBe(3);
  });

  it('refuses a block that contains anything beyond playback commands', () => {
    // A push followed by a stop: legible in part, but honouring only the half that is recognized would
    // misrepresent what the frame does, so the whole block is declined.
    expect(readSwfFrameActions(actions([0x96, 0x02, 0x00, 0x08, 0x00, 0x07]))).toBeNull();
    // A branch is the clearest case of something this is deliberately not equipped to reason about.
    expect(readSwfFrameActions(actions([0x99, 0x02, 0x00, 0x00, 0x00]))).toBeNull();
  });

  it('reports nothing for an empty block and for one that runs out mid-action', () => {
    expect(readSwfFrameActions(actions([0x00]))).toBeNull();
    expect(readSwfFrameActions(actions([0x81, 0x02, 0x00]))).toBeNull();
  });

  it('bounds a goto that points at its own frame instead of recursing without end', () => {
    const script = readSwfFrameActions(actions([0x81, 0x00, 0x00, 0x00, 0x00]))!;
    const clip = threeFrameClip();
    // The frame the goto lands on carries the same goto, which is the shape that would otherwise recurse.
    clip.data.timeline!.frameScripts = new Map([[1, script]]);

    expect(() => script(clip as Node2D, 1)).not.toThrow();
  });
});

function actions(bytes: readonly number[]): SwfReader {
  const source = new Uint8Array(bytes);
  return new SwfReader(source, 0, source.length);
}

function threeFrameClip(labels: readonly { frame: number; name: string }[] = []): MovieClip {
  const clip = createMovieClip();
  setMovieClipSource(clip, {
    constructFrame: () => undefined,
    frameRate: 24,
    labels,
    totalFrames: 3,
  });
  return clip;
}
