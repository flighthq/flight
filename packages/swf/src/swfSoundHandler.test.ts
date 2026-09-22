import { createAudioResource } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TimelineAudioCue, TimelineStreamAudioCue } from '@flighthq/types/contract';
import { TimelineAudioCueKind, TimelineStreamAudioCueKind } from '@flighthq/types/contract';

import { initializeTimelineAudioCue, initializeTimelineStreamAudioCue, swfSoundHandler } from './swfSoundHandler';

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

describe('swfSoundHandler', () => {
  it('claims the event and stream sound tags', () => {
    expect([...swfSoundHandler.tags].sort((a, b) => a - b)).toEqual([14, 15, 18, 19, 45, 89]);
  });

  it('defers cross-tag work to resolve and stream assembly to finishTimeline', () => {
    expect(swfSoundHandler.resolve).toBeDefined();
    expect(swfSoundHandler.finishTimeline).toBeDefined();
  });

  it('contributes resources but claims no placed character', () => {
    expect(swfSoundHandler.instantiate?.createResources).toBeDefined();
    expect(swfSoundHandler.instantiate?.createPlacementNode).toBeUndefined();
    expect(swfSoundHandler.instantiate?.hasPlacementContent).toBeUndefined();
  });
});
