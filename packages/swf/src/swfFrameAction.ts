import { readAbcFile, readAbcInstructions } from '@flighthq/abc/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  gotoAndPlayMovieClip,
  nextFrameMovieClip,
  playMovieClip,
  prevFrameMovieClip,
  stopMovieClip,
} from '@flighthq/movieclip/contract';
import type {
  AbcFile,
  AbcInstruction,
  FrameScript,
  ImportDiagnostic,
  MovieClip,
  Node2D,
} from '@flighthq/types/contract';
import { AbcOpcode, AbcTraitKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Recovers the timeline commands an AVM2 script declares, keyed by the class name that `SymbolClass` binds
// to a character. AVM2 has no playback opcodes: a compiler turns frame scripts into an `addFrameScript`
// call in the generated class constructor, pairing a zero-based frame index with a function whose body
// makes the actual call. So recognizing one means reading two levels — the constructor's call, then the
// body it points at — and both are read, never run.
//
// The same all-or-nothing rule as AVM1 applies to each frame's body: it is recognized only when the whole
// body is one playback call and the scaffolding around it, so a body doing real work is declined rather
// than partially obeyed.
export function readSwfAbcFrameScripts(
  source: Uint8Array,
  diagnostics?: ImportDiagnostic[],
): Map<string, Map<number, FrameScript>> | null {
  const file = readAbcFile(source);
  if (file === null) return null;

  const bodies = new Map<number, AbcInstruction[]>();
  for (const body of file.methodBodies) {
    const instructions = readAbcInstructions(body.code);
    if (instructions !== null) bodies.set(body.method, instructions);
  }

  const byClass = new Map<string, Map<number, FrameScript>>();
  for (const instance of file.instances) {
    const constructor = bodies.get(instance.initializer);
    if (constructor === undefined) continue;
    // A frame handler is usually a method on the class rather than an inline function, so the constructor
    // reaches it by name. Resolving those names needs the instance's own method traits.
    const methodsByName = new Map<string, number>();
    for (const trait of instance.traits) {
      if (trait.kind === AbcTraitKind.Method) methodsByName.set(resolveAbcName(file, trait.name), trait.methodIndex);
    }
    const frames = readSwfAbcFrameScriptCalls(file, constructor, bodies, methodsByName, diagnostics);
    if (frames.size > 0) byClass.set(resolveAbcQualifiedName(file, instance.name), frames);
  }
  return byClass;
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

// Walks a constructor for `addFrameScript(frame, handler, ...)` calls. The arguments arrive on the operand
// stack, so the pushes leading up to each call are tracked and taken in pairs — a zero-based frame index
// and the method a `newfunction` put there.
function readSwfAbcFrameScriptCalls(
  file: Readonly<AbcFile>,
  constructor: readonly Readonly<AbcInstruction>[],
  bodies: ReadonlyMap<number, AbcInstruction[]>,
  methodsByName: ReadonlyMap<string, number>,
  diagnostics?: ImportDiagnostic[],
): Map<number, FrameScript> {
  const frames = new Map<number, FrameScript>();
  const stack: SwfAbcValue[] = [];

  for (const instruction of constructor) {
    if (instruction.opcode === AbcOpcode.CallPropVoid || instruction.opcode === AbcOpcode.CallProperty) {
      const argumentCount = instruction.operands[1];
      const argumentsGiven = stack.splice(Math.max(0, stack.length - argumentCount), argumentCount);
      if (resolveAbcName(file, instruction.operands[0]) !== ADD_FRAME_SCRIPT) continue;
      for (let i = 0; i + 1 < argumentsGiven.length; i += 2) {
        const frame = argumentsGiven[i];
        const handler = argumentsGiven[i + 1];
        if (frame.kind !== 'number' || handler.kind !== 'method') continue;
        const body = bodies.get(handler.value);
        const commands = body === undefined ? null : readSwfAbcCommands(file, body);
        // The frame index the call carries is zero-based; every frame number elsewhere is one-based.
        if (commands === null) {
          // One report for both causes, because the caller loses the same thing either way: a frame the
          // file bound a script to has none. `reason` separates a method body that did not parse from a
          // body that parsed into work this importer declines to obey.
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'swf.abc-frame-script-declined',
            'readSwfAbcFrameScriptCalls',
            { frame: frame.value + 1, reason: body === undefined ? 'method-body-unreadable' : 'commands-declined' },
          );
          continue;
        }
        frames.set(frame.value + 1, createSwfFrameScript(commands));
      }
      continue;
    }
    if (instruction.opcode === AbcOpcode.GetProperty) {
      // `this.frameN` — the object comes off the stack and the named method takes its place, which is how
      // a compiler hands a frame handler to addFrameScript.
      stack.pop();
      const methodIndex = methodsByName.get(resolveAbcName(file, instruction.operands[0]));
      stack.push(
        methodIndex === undefined
          ? { kind: 'other', label: '', value: 0 }
          : { kind: 'method', label: '', value: methodIndex },
      );
      continue;
    }
    pushSwfAbcValue(file, stack, instruction);
  }
  return frames;
}

// Recognizes a frame handler's body as playback commands, or null when it does anything else.
function readSwfAbcCommands(
  file: Readonly<AbcFile>,
  body: readonly Readonly<AbcInstruction>[],
): SwfFrameCommand[] | null {
  const commands: SwfFrameCommand[] = [];
  const stack: SwfAbcValue[] = [];

  for (const instruction of body) {
    if (instruction.opcode === AbcOpcode.CallPropVoid || instruction.opcode === AbcOpcode.CallProperty) {
      const argumentCount = instruction.operands[1];
      const argumentsGiven = stack.splice(Math.max(0, stack.length - argumentCount), argumentCount);
      const command = resolveSwfAbcCommand(resolveAbcName(file, instruction.operands[0]), argumentsGiven);
      if (command === null) return null;
      commands.push(command);
      continue;
    }
    if (SCAFFOLDING.has(instruction.opcode)) continue;
    if (!pushSwfAbcValue(file, stack, instruction)) return null;
  }
  return commands.length === 0 ? null : commands;
}

function resolveSwfAbcCommand(name: string, argumentsGiven: readonly Readonly<SwfAbcValue>[]): SwfFrameCommand | null {
  if (name === 'stop' && argumentsGiven.length === 0) return { frame: 0, kind: 'stop', label: null };
  if (name === 'play' && argumentsGiven.length === 0) return { frame: 0, kind: 'play', label: null };
  if (name === 'nextFrame' && argumentsGiven.length === 0) return { frame: 0, kind: 'next', label: null };
  if (name === 'prevFrame' && argumentsGiven.length === 0) return { frame: 0, kind: 'previous', label: null };
  if ((name !== 'gotoAndStop' && name !== 'gotoAndPlay') || argumentsGiven.length !== 1) return null;
  const target = argumentsGiven[0];
  // AVM2 keeps the goto and its play state in one call, unlike AVM1 where a stop follows the jump.
  if (target.kind === 'label') return { frame: 0, kind: 'goto', label: target.label };
  return target.kind === 'number' ? { frame: target.value, kind: 'goto', label: null } : null;
}

// One value the operand stack is carrying. Only the shapes a frame script can legitimately push are
// modelled; anything else makes the body unrecognizable, which is the point.
interface SwfAbcValue {
  kind: 'label' | 'method' | 'number' | 'other';
  label: string;
  value: number;
}

function pushSwfAbcValue(
  file: Readonly<AbcFile>,
  stack: SwfAbcValue[],
  instruction: Readonly<AbcInstruction>,
): boolean {
  if (instruction.opcode === AbcOpcode.PushByte || instruction.opcode === AbcOpcode.PushShort) {
    stack.push({ kind: 'number', label: '', value: instruction.operands[0] });
  } else if (instruction.opcode === AbcOpcode.PushInt) {
    stack.push({ kind: 'number', label: '', value: file.constantPool.integers[instruction.operands[0]] ?? 0 });
  } else if (instruction.opcode === AbcOpcode.PushUint) {
    stack.push({ kind: 'number', label: '', value: file.constantPool.unsignedIntegers[instruction.operands[0]] ?? 0 });
  } else if (instruction.opcode === AbcOpcode.PushString) {
    stack.push({ kind: 'label', label: file.constantPool.strings[instruction.operands[0]] ?? '', value: 0 });
  } else if (instruction.opcode === AbcOpcode.NewFunction) {
    stack.push({ kind: 'method', label: '', value: instruction.operands[0] });
  } else {
    stack.push({ kind: 'other', label: '', value: 0 });
    return false;
  }
  return true;
}

function resolveAbcName(file: Readonly<AbcFile>, index: number): string {
  const multiname = file.constantPool.multinames[index];
  return multiname === undefined ? '' : (file.constantPool.strings[multiname.name] ?? '');
}

// A class name as `SymbolClass` writes it: the namespace is the package, joined to the name with a dot.
function resolveAbcQualifiedName(file: Readonly<AbcFile>, index: number): string {
  const multiname = file.constantPool.multinames[index];
  if (multiname === undefined) return '';
  const name = file.constantPool.strings[multiname.name] ?? '';
  const namespace = file.constantPool.namespaces[multiname.namespace];
  const packageName = namespace === undefined ? '' : (file.constantPool.strings[namespace.name] ?? '');
  return packageName === '' ? name : `${packageName}.${name}`;
}

const ADD_FRAME_SCRIPT = 'addFrameScript';

// What a compiler puts around a frame script's single call: the scope prologue, the lookups feeding the
// call, the coercion of its result, and the return. None of it changes what the frame does.
const SCAFFOLDING: ReadonlySet<number> = new Set([
  AbcOpcode.CoerceAny,
  AbcOpcode.Debug,
  AbcOpcode.DebugFile,
  AbcOpcode.DebugLine,
  AbcOpcode.FindPropStrict,
  AbcOpcode.GetLex,
  AbcOpcode.GetLocal0,
  AbcOpcode.Pop,
  AbcOpcode.PushScope,
  AbcOpcode.ReturnVoid,
]);
