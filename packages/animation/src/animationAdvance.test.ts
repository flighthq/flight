import { advanceAnimationPlayers } from './animationAdvance';
import { createAnimationChannel, createAnimationClip } from './animationClip';
import { createAnimationPlayer } from './animationPlayer';
import { createAnimationTrack } from './animationTrack';

describe('advanceAnimationPlayers', () => {
  it('records identity in caller-owned scratch and skips an already advanced player', () => {
    const player = createAnimationPlayer(
      createAnimationClip([createAnimationChannel(createAnimationTrack({ times: [0, 2], values: [0, 1] }), {})]),
    );
    const advanced = [player];
    advanceAnimationPlayers([player], 0.5, advanced);
    expect(player.time).toBe(0);
    expect(advanced).toEqual([player]);
  });
});
