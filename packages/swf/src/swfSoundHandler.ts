import { createAudioResource, createEmbeddedAudioResourceReference } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  AudioResource,
  AudioResourceReference,
  EntityConstruction,
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagTimelineState,
  TimelineAudioCue,
  TimelineAudioEnvelopePoint,
  TimelineCue,
  TimelineStreamAudioCue,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, TimelineAudioCueKind, TimelineStreamAudioCueKind } from '@flighthq/types/contract';

// Event and stream sounds: the payloads a document ships and the edge-triggered cues that start them. A
// trigger is not frame content — it is something entering a frame *does* — so a cue rides on the
// timeline rather than in its display list. Registering this family is what pulls audio resources in.

const TAG_DEFINE_SOUND = 14;
const TAG_SOUND_STREAM_BLOCK = 19;
const TAG_SOUND_STREAM_HEAD = 18;
const TAG_SOUND_STREAM_HEAD_2 = 45;
const TAG_START_SOUND = 15;
const TAG_START_SOUND_2 = 89;

export const swfSoundHandler: SwfTagHandler = {
  instantiate: {
    createResources(parsed, out) {
      out.audio.push(...createSwfAudioResources(parsed));
    },
  },
  tags: [
    TAG_DEFINE_SOUND,
    TAG_START_SOUND,
    TAG_START_SOUND_2,
    TAG_SOUND_STREAM_HEAD,
    TAG_SOUND_STREAM_HEAD_2,
    TAG_SOUND_STREAM_BLOCK,
  ],
  parse(body, tag, state, timeline) {
    if (tag === TAG_DEFINE_SOUND) readSwfSoundDefinition(body, state);
    else if (tag === TAG_START_SOUND) readSwfStartSound(body, state, timeline.cues, timeline.frames.length + 1);
    else if (tag === TAG_START_SOUND_2) readSwfStartSound2(body, state, timeline.cues, timeline.frames.length + 1);
    else if (tag === TAG_SOUND_STREAM_BLOCK) appendSwfStreamSoundChunk(body, state, timeline);
    else {
      const declared = readSwfSoundStreamHead(body);
      if (declared >= 0) {
        timeline.streamFormat = declared;
        timeline.streamStartFrame = timeline.frames.length + 1;
      }
    }
    return true;
  },
  finishTimeline(state, timeline) {
    appendSwfStreamSoundCue(state, timeline.cues, timeline.streamChunks, timeline.streamStartFrame);
  },
  resolve(state) {
    resolveSwfSoundClassCues(state);
    convertSwfSoundCueTimes(state);
  },
};

export function initializeTimelineAudioCue(
  out: EntityConstruction<TimelineAudioCue>,
  duration: number | null,
  envelope: readonly TimelineAudioEnvelopePoint[],
  frame: number,
  loops: number,
  offset: number,
  resource: AudioResource,
  skipIfPlaying: boolean,
  stop: boolean,
): void {
  out.duration = duration;
  out.envelope = envelope;
  out.frame = frame;
  out.gain = 1;
  out.kind = TimelineAudioCueKind;
  out.loops = loops;
  out.offset = offset;
  out.resource = resource;
  out.skipIfPlaying = skipIfPlaying;
  out.stop = stop;
}

export function initializeTimelineStreamAudioCue(
  out: EntityConstruction<TimelineStreamAudioCue>,
  frame: number,
  resource: AudioResource,
): void {
  out.frame = frame;
  out.gain = 1;
  out.kind = TimelineStreamAudioCueKind;
  out.resource = resource;
}

// Reads a stream header, returning the compression format when it declares a real stream and -1 when it
// does not. An authoring tool writes an empty header into practically every sprite, so the sample count is
// what separates a stream from that boilerplate.
function readSwfSoundStreamHead(body: SwfTagReader): number {
  body.readUint8();
  const streamFlags = body.readUint8();
  const samplesPerFrame = body.readUint16();
  if (!body.valid || samplesPerFrame === 0) return -1;
  return streamFlags >> 4;
}

// Joins a timeline's stream blocks into the one payload a decoder can take, and gives the timeline a cue to
// start it. SWF interleaves a stream with the display list so the two advance together, which is why the
// bytes arrive in pieces and why the cue names the frame the stream begins on rather than a duration.
function appendSwfStreamSoundCue(
  state: SwfTagParseState,
  cues: TimelineCue[],
  chunks: readonly Uint8Array[],
  startFrame: number,
): void {
  if (chunks.length === 0) return;
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  if (length === 0) return;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const resource = createAudioResource();
  state.streamSounds.push({ bytes, mimeType: 'audio/mpeg', resource });
  const cue = (() => {
    const out = allocateEntity<TimelineStreamAudioCue>();
    initializeTimelineStreamAudioCue(out, startFrame, resource);
    return finishEntity(out);
  })();
  cues.push(cue);
}

// StartSound triggers a sound the library already defines, carrying a SOUNDINFO that says how to play it.
// It becomes a TimelineAudioCue rather than anything that plays: an importer emits authored data, and only
// a registered handler acts on it.
//
// Every position SOUNDINFO carries is a sample count, and the two kinds count differently — an envelope
// point is always in 44.1kHz samples whatever the sound's rate, while the in and out points are in the
// sound's own. The envelope converts here; the in/out pair waits, because the sound it names may be
// defined further down the tag stream and its rate is not known yet.
function readSwfStartSound(body: SwfTagReader, state: SwfTagParseState, cues: TimelineCue[], frame: number): void {
  const characterId = body.readUint16();
  const info = readSwfSoundInfo(body);
  if (characterId === 0 || info === null) return;
  const cue = createSwfAudioCue(info, frame, acquireSwfSoundResource(state, characterId));
  cues.push(cue);
  state.soundCuesAwaitingRate.push({ characterId, cue });
}

// StartSound2 names its sound by the class an AS3 file bound to it rather than by character id, so the
// trigger cannot be resolved where it is read: SymbolClass, which is what maps a class name back to a
// character, is written near the end of a file and practically always after the sprite that triggers it.
// The cue is built against a resource of its own and adopted into the character's once the name resolves.
function readSwfStartSound2(body: SwfTagReader, state: SwfTagParseState, cues: TimelineCue[], frame: number): void {
  const className = body.readString();
  const info = readSwfSoundInfo(body);
  if (className === '' || info === null) return;
  const cue = createSwfAudioCue(info, frame, createAudioResource());
  cues.push(cue);
  state.soundCuesAwaitingClass.push({ className, cue });
}

// Reads the SOUNDINFO both triggers carry, or null when it does not decode. Positions stay in the samples
// the format counted them in; only the envelope converts here, because its unit is fixed at 44.1kHz while
// the in and out points are in a sound's own rate and that sound may not have been read yet.
function readSwfSoundInfo(body: SwfTagReader): SwfSoundInfo | null {
  const flags = body.readUint8();
  if (!body.valid) return null;
  const inPointSamples = (flags & SOUND_INFO_HAS_IN_POINT) !== 0 ? body.readUint32() : 0;
  const outPointSamples = (flags & SOUND_INFO_HAS_OUT_POINT) !== 0 ? body.readUint32() : -1;
  const loopCount = (flags & SOUND_INFO_HAS_LOOPS) !== 0 ? body.readUint16() : 1;
  const envelope: TimelineAudioEnvelopePoint[] = [];
  if ((flags & SOUND_INFO_HAS_ENVELOPE) !== 0) {
    const points = body.readUint8();
    for (let i = 0; i < points && body.valid; i++) {
      const position = body.readUint32();
      const leftLevel = body.readUint16();
      const rightLevel = body.readUint16();
      if (!body.valid) return null;
      envelope.push({
        leftGain: Math.min(leftLevel, SOUND_ENVELOPE_LEVEL_ONE) / SOUND_ENVELOPE_LEVEL_ONE,
        rightGain: Math.min(rightLevel, SOUND_ENVELOPE_LEVEL_ONE) / SOUND_ENVELOPE_LEVEL_ONE,
        time: position / SOUND_ENVELOPE_RATE,
      });
    }
  }
  if (!body.valid) return null;
  return {
    envelope,
    inPointSamples,
    loopCount,
    outPointSamples,
    skipIfPlaying: (flags & SOUND_INFO_SYNC_NO_MULTIPLE) !== 0,
    stop: (flags & SOUND_INFO_SYNC_STOP) !== 0,
  };
}

// Builds the cue one trigger becomes. A stop names the sound to silence and nothing else: every play field
// SOUNDINFO carries alongside it describes a playback being ended rather than started.
function createSwfAudioCue(info: Readonly<SwfSoundInfo>, frame: number, resource: AudioResource): TimelineAudioCue {
  const out = allocateEntity<TimelineAudioCue>();
  initializeTimelineAudioCue(
    out,
    info.stop || info.outPointSamples < 0 ? null : info.outPointSamples,
    info.stop ? [] : info.envelope,
    frame,
    info.stop ? 1 : Math.max(1, info.loopCount),
    info.stop ? 0 : info.inPointSamples,
    resource,
    !info.stop && info.skipIfPlaying,
    info.stop,
  );
  return finishEntity(out);
}

// Pairs every class-named trigger with the character its class was bound to, now that the whole tag stream
// has been walked. A cue whose class nothing declared keeps the resource it was built with: the trigger is
// real and the document simply never carried the sound it names.
function resolveSwfSoundClassCues(state: SwfTagParseState): void {
  if (state.soundCuesAwaitingClass.length === 0) return;
  const characterIds = new Map<string, number>();
  for (const [characterId, name] of state.linkages) characterIds.set(name, characterId);
  for (const pending of state.soundCuesAwaitingClass) {
    const characterId = characterIds.get(pending.className);
    if (characterId === undefined) continue;
    const existing = state.soundResources.get(characterId);
    // First trigger to name the character donates its resource; later ones adopt it, so every cue over one
    // sound still shares the single resource the document's reference fills.
    if (existing === undefined) state.soundResources.set(characterId, pending.cue.resource);
    else pending.cue.resource = existing;
    state.soundCuesAwaitingRate.push({ characterId, cue: pending.cue });
  }
}

// Converts the in and out points held in sample counts into the seconds a cue carries, once every sound's
// rate is known. A cue naming a sound the file never defined keeps its samples rather than guessing a rate.
function convertSwfSoundCueTimes(state: SwfTagParseState): void {
  for (const pending of state.soundCuesAwaitingRate) {
    const sound = state.sounds.get(pending.characterId);
    if (sound === undefined) continue;
    const inPoint = pending.cue.offset / sound.sampleRate;
    // SWF's out point is the last sample to play, so the span is measured from the in point.
    pending.cue.duration = pending.cue.duration === null ? null : pending.cue.duration / sound.sampleRate - inPoint;
    pending.cue.offset = inPoint;
  }
}

// Returns the one AudioResource every cue naming this sound shares, creating it on first mention. A cue can
// name a sound the tag stream has not reached, so this cannot wait for the payload.
function acquireSwfSoundResource(state: SwfTagParseState, characterId: number): AudioResource {
  const existing = state.soundResources.get(characterId);
  if (existing !== undefined) return existing;
  const resource = createAudioResource();
  state.soundResources.set(characterId, resource);
  return resource;
}

// DefineSound carries a whole event sound in one tag: a four-bit format, the playback rate/width/channel
// fields, a sample count, and the encoded payload. Only the format decides whether anything downstream can
// decode it, so that is what this keeps alongside the bytes — the rate and channel fields describe what the
// payload already says, and every format Flash could emit is self-describing to a decoder that knows it.
//
// A sound whose format has no standard container is retained rather than dropped: the bytes are the only
// copy, and a reference with a null MIME type is a sound waiting for a decoder instead of a sound lost.
function readSwfSoundDefinition(body: SwfTagReader, state: SwfTagParseState): void {
  const characterId = body.readUint16();
  const flags = body.readUint8();
  body.readUint32();
  if (!body.valid || characterId === 0 || state.sounds.has(characterId)) return;
  const format = flags >> 4;
  // An MP3 payload leads with a signed 16-bit seek offset that is not part of the bitstream, so the frames
  // a decoder wants start after it. Every other format's payload begins immediately.
  if (format === SOUND_FORMAT_MP3) body.readUint16();
  if (!body.valid) return;
  state.sounds.set(characterId, {
    bytes: body.source.subarray(body.pos, body.end),
    mimeType: createSwfSoundMimeType(format, flags),
    sampleRate: resolveSwfSoundSampleRate(format, flags),
  });
}

// Names the format a sound is in, so a decoder can be registered against it before one exists. Only MP3 is
// a type the platform already knows; the rest take a vendor type carrying the sample rate, channel count,
// and sample width that their bitstreams do not encode and a decoder cannot work without. Tagging beats
// leaving them null, because a null type is indistinguishable from bytes nobody identified.
//
// Returns null only for a format code SWF never defined, which is a sound this cannot describe at all.
function createSwfSoundMimeType(format: number, flags: number): string | null {
  if (format === SOUND_FORMAT_MP3) return 'audio/mpeg';
  const essence = SWF_SOUND_MIME_ESSENCES[format];
  if (essence === undefined) return null;
  const channels = (flags & 0x01) === 0 ? 1 : 2;
  const bits = (flags & 0x02) === 0 ? 8 : 16;
  return `${essence}; rate=${resolveSwfSoundSampleRate(format, flags)}; channels=${channels}; bits=${bits}`;
}

// Nellymoser 8k and 16k encode their rate in the format code itself, and the header's rate field is not
// what those decode at, so the code wins where the two disagree.
function resolveSwfSoundSampleRate(format: number, flags: number): number {
  if (format === SOUND_FORMAT_NELLYMOSER_8K) return 8000;
  if (format === SOUND_FORMAT_NELLYMOSER_16K) return 16000;
  return SWF_SOUND_RATES[(flags >> 2) & 0x03];
}

// Every event sound the file defined, in character order, each carrying the export name the file gave it
// when it gave one. Sounds are enumerated rather than discovered from the graph because nothing in the
// graph refers to them: a SWF triggers a sound from a timeline or from script, so a document that dropped
// the ones no frame happens to start would be discarding most of the audio a file ships with.
function createSwfAudioResources(parsed: Readonly<SwfTagParseResult>): AudioResourceReference[] {
  const resources: AudioResourceReference[] = [];
  for (const [characterId, sound] of parsed.sounds) {
    // ExportAssets is what publishes a sound for code to start. Every sound in a real file that no frame
    // triggers turns out to be one of these, so the name is the only way back to it.
    const name = parsed.linkages.get(characterId) ?? null;
    const reference = createEmbeddedAudioResourceReference(sound.bytes, sound.mimeType, name);
    // Every cue naming this sound already holds this resource, so decode has to fill that one rather than
    // the fresh one the constructor made.
    const shared = parsed.soundResources.get(characterId);
    if (shared !== undefined) reference.resource = shared;
    resources.push(reference);
  }
  // A stream has no character id and so no export name; the cue that starts it is its only handle.
  for (const stream of parsed.streamSounds) {
    const reference = createEmbeddedAudioResourceReference(stream.bytes, stream.mimeType, null);
    reference.resource = stream.resource;
    resources.push(reference);
  }
  return resources;
}

interface SwfSoundInfo {
  envelope: TimelineAudioEnvelopePoint[];
  inPointSamples: number;
  loopCount: number;
  outPointSamples: number;
  skipIfPlaying: boolean;
  stop: boolean;
}

const SOUND_ENVELOPE_LEVEL_ONE = 32768;

const SOUND_ENVELOPE_RATE = 44100;

const SOUND_INFO_HAS_ENVELOPE = 0x08;

const SOUND_INFO_HAS_IN_POINT = 0x01;

const SOUND_INFO_HAS_LOOPS = 0x04;

const SOUND_INFO_HAS_OUT_POINT = 0x02;

const SOUND_INFO_SYNC_NO_MULTIPLE = 0x10;

const SOUND_INFO_SYNC_STOP = 0x20;

const SOUND_FORMAT_MP3 = 2;

const SOUND_FORMAT_NELLYMOSER_16K = 4;

const SOUND_FORMAT_NELLYMOSER_8K = 5;

const SWF_SOUND_MIME_ESSENCES: Readonly<Record<number, string>> = {
  0: 'audio/vnd.adobe.swf-pcm',
  1: 'audio/vnd.adobe.swf-adpcm',
  3: 'audio/vnd.adobe.swf-pcm',
  4: 'audio/vnd.adobe.swf-nellymoser',
  5: 'audio/vnd.adobe.swf-nellymoser',
  6: 'audio/vnd.adobe.swf-nellymoser',
  11: 'audio/vnd.adobe.swf-speex',
};

const SWF_SOUND_RATES: readonly number[] = [5512, 11025, 22050, 44100];

function appendSwfStreamSoundChunk(body: SwfTagReader, state: SwfTagParseState, timeline: SwfTagTimelineState): void {
  if (timeline.streamFormat === SOUND_FORMAT_MP3) {
    body.readUint16();
    body.readUint16();
    if (body.valid && body.pos < body.end) timeline.streamChunks.push(body.source.subarray(body.pos, body.end));
    return;
  }
  if (timeline.streamFormat < 0) return;
  reportImportDiagnostic(
    state.diagnostics,
    ImportDiagnosticSeverity.Skip,
    'swf.stream-sound-format',
    'readSwfTimeline',
    { capability: 'swf.axis.sound-format-non-mp3', format: timeline.streamFormat },
  );
}
