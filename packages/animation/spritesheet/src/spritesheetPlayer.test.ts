import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';
import { connectSignal } from '@flighthq/signals';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';
import {
  createSpritesheetPlayer,
  getSpritesheetPlayerFrame,
  queueSpritesheetAnimation,
  showSpritesheetAnimation,
  updateSpritesheetPlayer,
} from './spritesheetPlayer';

function makeSheet(frameCount: number, atlas = null): Spritesheet {
  const sheet = createSpritesheet({ atlas });
  for (let i = 0; i < frameCount; i++) {
    sheet.frames.push(createSpritesheetFrame({ id: i }));
  }
  return sheet;
}

function makeAnimation(frameIndices: number[], frameDuration: number, loop = true): SpritesheetAnimation {
  return createSpritesheetAnimation({ frames: frameIndices, frameDuration, loop });
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
});

describe('showSpritesheetAnimation', () => {
  it('sets animation and resets state', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    showSpritesheetAnimation(player, anim);
    expect(player.animation).toBe(anim);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('clears the queue', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    const queued = makeAnimation([2, 3], 100);
    showSpritesheetAnimation(player, anim);
    queueSpritesheetAnimation(player, queued);
    showSpritesheetAnimation(player, anim);
    expect(player.queue).toEqual([]);
  });

  it('does not restart if same animation and restart=false', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    showSpritesheetAnimation(player, anim);
    player.elapsed = 150;
    showSpritesheetAnimation(player, anim, false);
    expect(player.elapsed).toBe(150);
  });

  it('restarts if same animation and restart=true', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    showSpritesheetAnimation(player, anim);
    player.elapsed = 150;
    showSpritesheetAnimation(player, anim, true);
    expect(player.elapsed).toBe(0);
  });
});

describe('updateSpritesheetPlayer', () => {
  it('returns false when no animation', () => {
    const player = createSpritesheetPlayer();
    expect(updateSpritesheetPlayer(player, 16)).toBe(false);
  });

  it('advances elapsed time', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    showSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 50);
    expect(player.elapsed).toBe(50);
  });

  it('selects correct frame index from elapsed time', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    showSpritesheetAnimation(player, anim);

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
    showSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 400);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('clamps to last frame and marks complete for non-looping animation', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100, false);
    showSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 500);
    expect(player.frameIndex).toBe(3);
    expect(player.complete).toBe(true);
  });

  it('returns false after non-looping animation completes', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100, false);
    showSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 300);
    expect(updateSpritesheetPlayer(player, 100)).toBe(false);
  });

  it('advances to queued animation when non-looping animation completes', () => {
    const player = createSpritesheetPlayer();
    const first = makeAnimation([0, 1], 100, false);
    const second = makeAnimation([2, 3], 100, false);
    showSpritesheetAnimation(player, first);
    queueSpritesheetAnimation(player, second);
    updateSpritesheetPlayer(player, 300);
    expect(player.animation).toBe(second);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(false);
  });

  it('plays through multiple queued animations in order', () => {
    const player = createSpritesheetPlayer();
    const first = makeAnimation([0], 100, false);
    const second = makeAnimation([1], 100, false);
    const third = makeAnimation([2], 100, false);
    showSpritesheetAnimation(player, first);
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
    showSpritesheetAnimation(player, anim);
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
    showSpritesheetAnimation(player, anim);
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    updateSpritesheetPlayer(player, 400);
    expect(fired).toBe(0);
  });

  it('emits onLoop each time a looping animation cycles', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100, true);
    showSpritesheetAnimation(player, anim);
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
    showSpritesheetAnimation(player, anim);
    let loops = 0;
    connectSignal(player.onLoop, () => loops++);
    updateSpritesheetPlayer(player, 500);
    expect(loops).toBe(0);
  });

  it('does not advance queue for looping animation', () => {
    const player = createSpritesheetPlayer();
    const looping = makeAnimation([0, 1], 100, true);
    const queued = makeAnimation([2, 3], 100, false);
    showSpritesheetAnimation(player, looping);
    queueSpritesheetAnimation(player, queued);
    updateSpritesheetPlayer(player, 500);
    expect(player.animation).toBe(looping);
    expect(player.queue).toHaveLength(1);
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
    showSpritesheetAnimation(player, anim);

    updateSpritesheetPlayer(player, 200);
    const frame = getSpritesheetPlayerFrame(player, sheet);
    expect(frame).not.toBeNull();
    expect(frame!.id).toBe(2);
  });
});
