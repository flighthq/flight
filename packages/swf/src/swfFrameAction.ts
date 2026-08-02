import {
  gotoAndPlayMovieClip,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  stopMovieClip,
} from '@flighthq/movieclip/contract';
import type { FrameScript, MovieClip, Node2D } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Recognizes the timeline commands an AVM1 `DoAction` block carries, and emits them as data.
//
// This is deliberately not an interpreter, and the distinction is the whole point. AVM1 gives playback
// control its own single-byte opcodes — stop, play, and the two goto forms are literal instructions, not
// method calls — so reading them is the same kind of work as reading a placement record. What comes back
// is a description of what the frame asks for; binding that description to Flight's own MovieClip calls is
// a separate step, and nothing from the file is ever executed. A bounded declarative descriptor is the
// allowed side of the line that a Turing-complete VM sits on the far side of.
//
// A block is recognized ONLY when every action in it is one of these commands. Anything else — a branch, a
// property access, arithmetic, a function call — and the whole block is skipped rather than partially
// honoured, because obeying the half of a script that happens to be legible misrepresents what the file
// does. Returns null for an unrecognized or malformed block.
export function readSwfFrameActions(reader: SwfReader): FrameScript | null {
  const commands: SwfFrameCommand[] = [];
  for (let actions = 0; actions < MAX_FRAME_ACTIONS; actions++) {
    if (reader.pos >= reader.end) break;
    const code = reader.readUint8();
    if (!reader.valid) return null;
    if (code === ACTION_END) break;

    // Everything from 0x80 up carries a length-prefixed body; everything below is the bare opcode.
    const length = code >= ACTION_HAS_BODY ? reader.readUint16() : 0;
    const bodyEnd = reader.pos + length;
    if (!reader.valid || bodyEnd > reader.end) return null;

    if (code === ACTION_STOP) commands.push({ frame: 0, kind: 'stop', label: null });
    else if (code === ACTION_PLAY) commands.push({ frame: 0, kind: 'play', label: null });
    else if (code === ACTION_NEXT_FRAME) commands.push({ frame: 0, kind: 'next', label: null });
    else if (code === ACTION_PREVIOUS_FRAME) commands.push({ frame: 0, kind: 'previous', label: null });
    else if (code === ACTION_GOTO_FRAME) {
      // The opcode's frame is zero-based where every Flight and SWF frame number is one-based.
      commands.push({ frame: reader.readUint16() + 1, kind: 'goto', label: null });
    } else if (code === ACTION_GOTO_LABEL) {
      commands.push({ frame: 0, kind: 'goto', label: reader.readString() });
    } else {
      return null;
    }

    reader.pos = bodyEnd;
    if (!reader.valid) return null;
  }
  return commands.length === 0 ? null : createSwfFrameScript(commands);
}

// What one recognized action asks the timeline to do. `goto` carries either a frame or a label, which is
// the same pair the MovieClip API already accepts.
interface SwfFrameCommand {
  frame: number;
  kind: 'goto' | 'next' | 'play' | 'previous' | 'stop';
  label: string | null;
}

// Binds recognized commands to Flight's own MovieClip calls. A goto reconstructs the frame it lands on,
// which runs that frame's script in turn, so a file whose frames point at each other would recurse without
// a bound. The depth counter is that bound: past it, further gotos are ignored for the rest of the
// outermost call rather than growing the stack. Flash bounds the same case in its own player.
function createSwfFrameScript(commands: readonly Readonly<SwfFrameCommand>[]): FrameScript {
  return (target: Node2D): void => {
    const clip = target as MovieClip;
    if (_gotoDepth > MAX_GOTO_DEPTH) return;
    _gotoDepth++;
    try {
      for (const command of commands) {
        if (command.kind === 'stop') stopMovieClip(clip);
        else if (command.kind === 'play') playMovieClip(clip);
        else if (command.kind === 'next') nextFrameMovieClip(clip);
        else if (command.kind === 'previous') prevFrameMovieClip(clip);
        // A bare goto only moves the playhead; whether playback continues is decided by the stop or play
        // the compiler emits after it, which arrives as the next command here.
        else if (command.label !== null) gotoAndPlayMovieClip(clip, command.label);
        else gotoAndPlayMovieClip(clip, command.frame);
      }
    } finally {
      _gotoDepth--;
    }
  };
}

const ACTION_END = 0x00;
const ACTION_GOTO_FRAME = 0x81;
const ACTION_GOTO_LABEL = 0x8c;
const ACTION_HAS_BODY = 0x80;
const ACTION_NEXT_FRAME = 0x04;
const ACTION_PLAY = 0x06;
const ACTION_PREVIOUS_FRAME = 0x05;
const ACTION_STOP = 0x07;
const MAX_FRAME_ACTIONS = 10_000;
const MAX_GOTO_DEPTH = 8;
let _gotoDepth = 0;
