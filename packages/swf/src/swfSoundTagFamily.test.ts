import { createAudioResource } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TimelineAudioCue, TimelineStreamAudioCue } from '@flighthq/types/contract';
import { TimelineAudioCueKind, TimelineStreamAudioCueKind } from '@flighthq/types/contract';

import { swfSoundHandler } from './swfSoundHandler';
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
  it('contains the union of its handler tags', () => {
    expect([...swfSoundTagFamily.tags].sort((a, b) => a - b)).toEqual([...swfSoundHandler.tags].sort((a, b) => a - b));
  });

  it('composes resolve and finishTimeline from its handler', () => {
    expect(swfSoundTagFamily.resolve).toBeDefined();
    expect(swfSoundTagFamily.finishTimeline).toBeDefined();
  });

  it('contributes resources but claims no placed character', () => {
    expect(swfSoundTagFamily.instantiate?.createResources).toBeDefined();
    expect(swfSoundTagFamily.instantiate?.createPlacementNode).toBeUndefined();
    expect(swfSoundTagFamily.instantiate?.hasPlacementContent).toBeUndefined();
  });
});
