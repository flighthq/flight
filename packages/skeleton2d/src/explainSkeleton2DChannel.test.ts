import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import type { AnimationChannel, AnimationInterpolation } from '@flighthq/types/contract';

import { explainSkeleton2DChannelInterpolation, isSkeleton2DSteppedChannelSubject } from './explainSkeleton2DChannel';

describe('explainSkeleton2DChannelInterpolation', () => {
  it('reports the override a non-step attachment channel will receive', () => {
    expect(explainSkeleton2DChannelInterpolation(channel('Linear'), 'Attachment')).toEqual({
      applied: 'Step',
      stated: 'Linear',
      subject: 'Attachment',
    });
  });

  it('reports nothing for a channel already authored as steps', () => {
    // Nothing is overridden, so there is nothing to explain — the common answer.
    expect(explainSkeleton2DChannelInterpolation(channel('Step'), 'Attachment')).toBeNull();
  });

  it('reports nothing for a family whose values can be blended', () => {
    // The same Linear track is honoured on a bone and stepped on an attachment, which is why this is
    // a question about what the channel DRIVES rather than about the channel.
    expect(explainSkeleton2DChannelInterpolation(channel('Linear'), 'Bone')).toBeNull();
  });

  it('reports the override for a draw-order channel too', () => {
    expect(explainSkeleton2DChannelInterpolation(channel('Cubic'), 'DrawOrder')?.stated).toBe('Cubic');
  });
});

describe('isSkeleton2DSteppedChannelSubject', () => {
  it('names the families that carry a value which cannot be blended', () => {
    expect(isSkeleton2DSteppedChannelSubject('Attachment')).toBe(true);
    expect(isSkeleton2DSteppedChannelSubject('DrawOrder')).toBe(true);
  });

  it('leaves every blendable family alone', () => {
    expect(isSkeleton2DSteppedChannelSubject('Bone')).toBe(false);
    expect(isSkeleton2DSteppedChannelSubject('Color')).toBe(false);
  });
});

function channel(interpolation: AnimationInterpolation): AnimationChannel {
  return createAnimationChannel(createAnimationTrack({ interpolation, times: [0, 1], values: [0, 1] }), null);
}
