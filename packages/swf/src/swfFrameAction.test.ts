import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import {
  createMovieClip,
  getMovieClipCurrentFrame,
  isMovieClipPlaying,
  playMovieClip,
  setMovieClipSource,
} from '@flighthq/movieclip/contract';
import type { MovieClip, Node2D } from '@flighthq/types/contract';
import { EntityRuntimeKey, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { readSwfAbcFrameScripts, readSwfFrameActions } from './swfFrameAction';
import { buildFrameScriptAbc } from './swfFrameActionTestHelper';
import { SwfReader } from './swfReader';

describe('readSwfAbcFrameScripts', () => {
  it('follows a compiler-shaped addFrameScript call to the method it names', () => {
    const scripts = readSwfAbcFrameScripts(buildFrameScriptAbc());

    // The handler is a class method reached by name, which is what a compiler emits — not an inline
    // function — so resolving it means reading the instance's method traits.
    const frames = scripts!.get('Main');
    expect([...frames!.keys()]).toEqual([1]);

    const clip = threeFrameClip();
    playMovieClip(clip);
    frames!.get(1)!(clip as Node2D, 1);
    expect(isMovieClipPlaying(clip)).toBe(false);
  });

  it('reports a frame script whose body is not a command this importer obeys', () => {
    // The handler calls a name that is not one of the recognized playback commands, so the body parses
    // and is then declined. The file bound a script to frame 1 and the document has none.
    const diagnostics = collectImportDiagnostics((sink) => {
      expect(readSwfAbcFrameScripts(buildFrameScriptAbc(1), sink)).not.toBeNull();
    });

    const dropped = diagnostics.filter((entry) => entry.kind === 'swf.abc-frame-script-declined');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(dropped[0].detail).toEqual({ frame: 1, reason: 'commands-declined' });
  });

  it('stays silent about a frame script it does obey, so the drop entry carries information', () => {
    const diagnostics = collectImportDiagnostics((sink) => {
      const scripts = readSwfAbcFrameScripts(buildFrameScriptAbc(), sink);
      // Non-vacuous: a run that bound no frame script would be silent for the wrong reason.
      expect([...scripts!.get('Main')!.keys()]).toEqual([1]);
    });

    expect(diagnostics).toEqual([]);
  });

  it('reports nothing for bytecode that is not a readable container', () => {
    expect(readSwfAbcFrameScripts(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

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

// An ABC file shaped the way a compiler writes one: a class whose constructor calls
// `addFrameScript(0, this.frame1)`, and a `frame1` method whose whole body is `stop()`.
function actions(bytes: readonly number[]): SwfReader {
  const source = new Uint8Array(bytes);
  return new SwfReader(source, 0, source.length);
}

function threeFrameClip(labels: readonly { frame: number; name: string }[] = []): MovieClip {
  const clip = createMovieClip();
  setMovieClipSource(clip, {
    [EntityRuntimeKey]: undefined,
    constructFrame: () => undefined,
    cues: [],
    frameRate: 24,
    labels,
    totalFrames: 3,
  });
  return clip;
}
