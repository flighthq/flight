import { connectSignal } from '@flighthq/signals';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';
import {
  createSpritesheetPlayer,
  getSpritesheetPlayerFrame,
  playSpritesheetAnimation,
  queueSpritesheetAnimation,
  updateSpritesheetPlayer,
} from './spritesheetPlayer';

function makeAnimation(frameIndices: number[], frameDuration: number, loop = true): SpritesheetAnimation {
  return createSpritesheetAnimation({ frames: frameIndices, frameDuration, loop });
}

function makeSheet(frameCount: number, atlas = null): Spritesheet {
  const sheet = createSpritesheet({ atlas });
  for (let i = 0; i < frameCount; i++) {
    sheet.frames.push(createSpritesheetFrame({ id: i }));
  }
  return sheet;
}

describe('createSpritesheetPlayer', () => {
  it('starts complete with no animation', () => {
    const player = createSpritesheetPlayer();
    expect(player.animation).toBeNull();
    expect(player.complete).toBe(true);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.queue).toEqual([]);
  });

  it('uses provided queue and signals directly', () => {
    const animation = makeAnimation([0], 100);
    const queue = [animation];
    const player = createSpritesheetPlayer({ queue });
    expect(player.queue).toBe(queue);
  });
});

describe('getSpritesheetPlayerFrame', () => {
  it('returns null when no animation', () => {
    const player = createSpritesheetPlayer();
    const sheet = makeSheet(4);
    expect(getSpritesheetPlayerFrame(player, sheet)).toBeNull();
  });

  it('returns the correct SpritesheetFrame for current frameIndex', () => {
    const sheet = makeSheet(4);
    const anim = makeAnimation([0, 1, 2, 3], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);

    updateSpritesheetPlayer(player, 200);
    const frame = getSpritesheetPlayerFrame(player, sheet);
    expect(frame).not.toBeNull();
    expect(frame!.id).toBe(2);
  });

  it('returns null when the animation frame points outside the sheet', () => {
    const sheet = makeSheet(1);
    const anim = makeAnimation([2], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    expect(getSpritesheetPlayerFrame(player, sheet)).toBeNull();
  });

  it('returns null when the current animation has no frames', () => {
    const sheet = makeSheet(1);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([], 100));
    expect(getSpritesheetPlayerFrame(player, sheet)).toBeNull();
  });
});

describe('playSpritesheetAnimation', () => {
  it('sets animation and resets state', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    expect(player.animation).toBe(anim);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('clears the queue', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    const queued = makeAnimation([2, 3], 100);
    playSpritesheetAnimation(player, anim);
    queueSpritesheetAnimation(player, queued);
    playSpritesheetAnimation(player, anim);
    expect(player.queue).toEqual([]);
  });

  it('does not restart if same animation and restart=false', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    player.elapsed = 150;
    playSpritesheetAnimation(player, anim, false);
    expect(player.elapsed).toBe(150);
  });

  it('restarts if same animation and restart=true', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    player.elapsed = 150;
    playSpritesheetAnimation(player, anim, true);
    expect(player.elapsed).toBe(0);
  });

  it('clears animation and marks complete when animation is null', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    playSpritesheetAnimation(player, anim);
    queueSpritesheetAnimation(player, makeAnimation([2], 100));
    playSpritesheetAnimation(player, null);
    expect(player.animation).toBeNull();
    expect(player.complete).toBe(true);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.queue).toEqual([]);
  });
});

describe('queueSpritesheetAnimation', () => {
  it('appends animation to the queue', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    queueSpritesheetAnimation(player, anim);
    expect(player.queue).toHaveLength(1);
    expect(player.queue[0]).toBe(anim);
  });

  it('appends multiple animations in order', () => {
    const player = createSpritesheetPlayer();
    const a1 = makeAnimation([0], 100);
    const a2 = makeAnimation([1], 100);
    queueSpritesheetAnimation(player, a1);
    queueSpritesheetAnimation(player, a2);
    expect(player.queue[0]).toBe(a1);
    expect(player.queue[1]).toBe(a2);
  });
});

describe('updateSpritesheetPlayer', () => {
  it('returns false when no animation', () => {
    const player = createSpritesheetPlayer();
    expect(updateSpritesheetPlayer(player, 16)).toBe(false);
  });

  it('returns false for an animation with no frames', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([], 100));
    expect(updateSpritesheetPlayer(player, 16)).toBe(false);
  });

  it('advances elapsed time', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 50);
    expect(player.elapsed).toBe(50);
  });

  it('selects correct frame index from elapsed time', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);

    updateSpritesheetPlayer(player, 0);
    expect(player.frameIndex).toBe(0);

    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(1);

    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(2);
  });

  it('loops back to frame 0 after full loop', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 400);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('clamps to last frame and marks complete for non-looping animation', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100, false);
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 500);
    expect(player.frameIndex).toBe(3);
    expect(player.complete).toBe(true);
  });

  it('returns false after non-looping animation completes', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100, false);
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 300);
    expect(updateSpritesheetPlayer(player, 100)).toBe(false);
  });

  it('advances to queued animation when non-looping animation completes', () => {
    const player = createSpritesheetPlayer();
    const first = makeAnimation([0, 1], 100, false);
    const second = makeAnimation([2, 3], 100, false);
    playSpritesheetAnimation(player, first);
    queueSpritesheetAnimation(player, second);
    updateSpritesheetPlayer(player, 300);
    expect(player.animation).toBe(second);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('does not emit onComplete when advancing to a queued animation', () => {
    const player = createSpritesheetPlayer();
    const first = makeAnimation([0], 100, false);
    const second = makeAnimation([1], 100, false);
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    playSpritesheetAnimation(player, first);
    queueSpritesheetAnimation(player, second);
    updateSpritesheetPlayer(player, 200);
    expect(player.animation).toBe(second);
    expect(fired).toBe(0);
  });

  it('plays through multiple queued animations in order', () => {
    const player = createSpritesheetPlayer();
    const first = makeAnimation([0], 100, false);
    const second = makeAnimation([1], 100, false);
    const third = makeAnimation([2], 100, false);
    playSpritesheetAnimation(player, first);
    queueSpritesheetAnimation(player, second);
    queueSpritesheetAnimation(player, third);

    updateSpritesheetPlayer(player, 200);
    expect(player.animation).toBe(second);

    updateSpritesheetPlayer(player, 200);
    expect(player.animation).toBe(third);

    updateSpritesheetPlayer(player, 200);
    expect(player.complete).toBe(true);
  });

  it('emits onComplete when non-looping animation finishes', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100, false);
    playSpritesheetAnimation(player, anim);
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    updateSpritesheetPlayer(player, 400);
    expect(fired).toBe(1);
    updateSpritesheetPlayer(player, 100);
    expect(fired).toBe(1);
  });

  it('does not emit onComplete for looping animation', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100, true);
    playSpritesheetAnimation(player, anim);
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    updateSpritesheetPlayer(player, 400);
    expect(fired).toBe(0);
  });

  it('emits onLoop each time a looping animation cycles', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100, true);
    playSpritesheetAnimation(player, anim);
    let loops = 0;
    connectSignal(player.onLoop, () => loops++);
    updateSpritesheetPlayer(player, 400);
    expect(loops).toBe(1);
    updateSpritesheetPlayer(player, 400);
    expect(loops).toBe(2);
  });

  it('does not emit onLoop for non-looping animation', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100, false);
    playSpritesheetAnimation(player, anim);
    let loops = 0;
    connectSignal(player.onLoop, () => loops++);
    updateSpritesheetPlayer(player, 500);
    expect(loops).toBe(0);
  });

  it('does not advance queue for looping animation', () => {
    const player = createSpritesheetPlayer();
    const looping = makeAnimation([0, 1], 100, true);
    const queued = makeAnimation([2, 3], 100, false);
    playSpritesheetAnimation(player, looping);
    queueSpritesheetAnimation(player, queued);
    updateSpritesheetPlayer(player, 500);
    expect(player.animation).toBe(looping);
    expect(player.queue).toHaveLength(1);
  });
});
