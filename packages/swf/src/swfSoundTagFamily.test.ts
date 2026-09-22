import { createAudioResource } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TimelineAudioCue, TimelineStreamAudioCue } from '@flighthq/types/contract';
import { TimelineAudioCueKind, TimelineStreamAudioCueKind } from '@flighthq/types/contract';

import { initializeTimelineAudioCue, initializeTimelineStreamAudioCue, swfSoundTagFamily } from './swfSoundTagFamily';

describe('initializeTimelineAudioCue', () => {
  it('writes every field of an event cue, at unit gain', () => {
    const resource = createAudioResource();
    const envelope = [{ leftGain: 1, rightGain: 1, time: 0 }];
    const out = allocateEntity<TimelineAudioCue>();
    initializeTimelineAudioCue(out, 2.5, envelope, 7, 3, 0.25, resource, true, false);
    const cue = finishEntity(out);

    expect(cue.kind).toBe(TimelineAudioCueKind);
    expect(cue.duration).toBe(2.5);
    expect(cue.envelope).toBe(envelope);
    expect(cue.frame).toBe(7);
    expect(cue.loops).toBe(3);
    expect(cue.offset).toBe(0.25);
    expect(cue.resource).toBe(resource);
    expect(cue.skipIfPlaying).toBe(true);
    expect(cue.stop).toBe(false);
    // Gain is not something SOUNDINFO carries; a cue plays at the resource's own level.
    expect(cue.gain).toBe(1);
  });

  it('carries a stop cue, whose duration is absent rather than zero', () => {
    const out = allocateEntity<TimelineAudioCue>();
    initializeTimelineAudioCue(out, null, [], 1, 1, 0, createAudioResource(), false, true);
    const cue = finishEntity(out);
    expect(cue.stop).toBe(true);
    expect(cue.duration).toBeNull();
  });
});

describe('initializeTimelineStreamAudioCue', () => {
  it('writes the frame the stream begins on and the resource it plays', () => {
    const resource = createAudioResource();
    const out = allocateEntity<TimelineStreamAudioCue>();
    initializeTimelineStreamAudioCue(out, 4, resource);
    const cue = finishEntity(out);

    expect(cue.kind).toBe(TimelineStreamAudioCueKind);
    expect(cue.frame).toBe(4);
    expect(cue.resource).toBe(resource);
    expect(cue.gain).toBe(1);
  });
});

describe('swfSoundTagFamily', () => {
  it('claims the event and stream sound tags and nothing else', () => {
    expect([...swfSoundTagFamily.tags].sort((a, b) => a - b)).toEqual([14, 15, 18, 19, 45, 89]);
  });

  // The cue conversions and the class binding cannot happen at the tag: a trigger can name a sound, or a
  // class, that the tag stream has not reached yet.
  it('defers its cross-tag work to resolve, and its stream assembly to each timeline', () => {
    expect(swfSoundTagFamily.resolve).toBeDefined();
    expect(swfSoundTagFamily.finishTimeline).toBeDefined();
  });

  it('contributes resources but claims no placed character', () => {
    // A SWF triggers a sound from a timeline or from script; nothing in the display list refers to one,
    // so a sound is enumerated into the document rather than discovered from the graph.
    expect(swfSoundTagFamily.instantiate?.createResources).toBeDefined();
    expect(swfSoundTagFamily.instantiate?.createPlacementNode).toBeUndefined();
    expect(swfSoundTagFamily.instantiate?.hasPlacementContent).toBeUndefined();
  });
});
