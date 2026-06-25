import { connectSignal } from '@flighthq/signals';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetAnimation } from './spritesheetAnimation';
import { createSpritesheetFrame } from './spritesheetFrame';
import {
  acquireSpritesheetPlayer,
  cloneSpritesheetPlayer,
  createSpritesheetPlayer,
  disposeSpritesheetPlayer,
  getSpritesheetPlayerFrame,
  getSpritesheetPlayerFrameAt,
  pauseSpritesheetPlayer,
  playSpritesheetAnimation,
  queueSpritesheetAnimation,
  releaseSpritesheetPlayer,
  resumeSpritesheetPlayer,
  seekSpritesheetPlayerToFrame,
  seekSpritesheetPlayerToTime,
  stopSpritesheetPlayer,
  updateSpritesheetPlayer,
} from './spritesheetPlayer';

function makeAnimation(frameIndices: number[], frameDuration: number, loop = true) {
  return createSpritesheetAnimation({ frames: frameIndices, frameDuration, loop });
}

function makeSheet(frameCount: number, atlas = null) {
  const sheet = createSpritesheet({ atlas });
  for (let i = 0; i < frameCount; i++) {
    sheet.frames.push(createSpritesheetFrame({ id: i }));
  }
  return sheet;
}

describe('acquireSpritesheetPlayer', () => {
  it('returns a player in idle/complete state', () => {
    const player = acquireSpritesheetPlayer();
    expect(player.animation).toBeNull();
    expect(player.complete).toBe(true);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.paused).toBe(false);
    expect(player.speed).toBe(1);
    expect(player.queue).toHaveLength(0);
  });

  it('returns a previously released player from the pool', () => {
    const p = acquireSpritesheetPlayer();
    releaseSpritesheetPlayer(p);
    const p2 = acquireSpritesheetPlayer();
    expect(p2).toBe(p);
  });

  it('resets state on reacquire', () => {
    const p = acquireSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    playSpritesheetAnimation(p, anim);
    p.elapsed = 50;
    p.speed = 2;
    releaseSpritesheetPlayer(p);
    const p2 = acquireSpritesheetPlayer();
    expect(p2.animation).toBeNull();
    expect(p2.elapsed).toBe(0);
    expect(p2.speed).toBe(1);
  });
});

describe('cloneSpritesheetPlayer', () => {
  it('returns a new player with copied head state', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    player.elapsed = 150;
    player.frameIndex = 1;
    const clone = cloneSpritesheetPlayer(player);
    expect(clone).not.toBe(player);
    expect(clone.animation).toBe(anim);
    expect(clone.elapsed).toBe(150);
    expect(clone.frameIndex).toBe(1);
    expect(clone.complete).toBe(false);
  });

  it('clone has independent signals from original', () => {
    const player = createSpritesheetPlayer();
    const clone = cloneSpritesheetPlayer(player);
    expect(clone.onComplete).not.toBe(player.onComplete);
    expect(clone.onLoop).not.toBe(player.onLoop);
  });

  it('clone has an independent queue', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0], 100);
    queueSpritesheetAnimation(player, anim);
    const clone = cloneSpritesheetPlayer(player);
    expect(clone.queue).not.toBe(player.queue);
    expect(clone.queue).toHaveLength(1);
  });
});

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

describe('disposeSpritesheetPlayer', () => {
  it('clears animation and marks complete', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([0], 100));
    disposeSpritesheetPlayer(player);
    expect(player.animation).toBeNull();
    expect(player.complete).toBe(true);
    expect(player.queue).toHaveLength(0);
  });

  it('disconnects onComplete and onLoop slots', () => {
    const player = createSpritesheetPlayer();
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    disposeSpritesheetPlayer(player);
    // Emitting after dispose should not fire previously connected slots.
    player.onComplete.emit();
    expect(fired).toBe(0);
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

describe('getSpritesheetPlayerFrameAt', () => {
  it('returns null when no animation', () => {
    const player = createSpritesheetPlayer();
    expect(getSpritesheetPlayerFrameAt(player, makeSheet(4), 0)).toBeNull();
  });

  it('returns null when animation has no frames', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([], 100));
    expect(getSpritesheetPlayerFrameAt(player, makeSheet(4), 0)).toBeNull();
  });

  it('returns the current frame at offset 0', () => {
    const sheet = makeSheet(4);
    const anim = makeAnimation([0, 1, 2, 3], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 100); // frameIndex = 1
    const frame = getSpritesheetPlayerFrameAt(player, sheet, 0);
    expect(frame).not.toBeNull();
    expect(frame!.id).toBe(1);
  });

  it('returns the next frame at offset +1', () => {
    const sheet = makeSheet(4);
    const anim = makeAnimation([0, 1, 2, 3], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 100); // frameIndex = 1
    const frame = getSpritesheetPlayerFrameAt(player, sheet, 1);
    expect(frame!.id).toBe(2);
  });

  it('wraps forward past the last frame', () => {
    const sheet = makeSheet(3);
    const anim = makeAnimation([0, 1, 2], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 200); // frameIndex = 2
    const frame = getSpritesheetPlayerFrameAt(player, sheet, 1);
    expect(frame!.id).toBe(0); // wraps from frame 2 → frame 0
  });

  it('wraps backward past the first frame', () => {
    const sheet = makeSheet(3);
    const anim = makeAnimation([0, 1, 2], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    // frameIndex = 0; offset -1 should wrap to frame 2
    const frame = getSpritesheetPlayerFrameAt(player, sheet, -1);
    expect(frame!.id).toBe(2);
  });

  it('does not mutate player state', () => {
    const sheet = makeSheet(4);
    const anim = makeAnimation([0, 1, 2, 3], 100);
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, anim);
    const before = { frameIndex: player.frameIndex, elapsed: player.elapsed };
    getSpritesheetPlayerFrameAt(player, sheet, 2);
    expect(player.frameIndex).toBe(before.frameIndex);
    expect(player.elapsed).toBe(before.elapsed);
  });
});

describe('pauseSpritesheetPlayer', () => {
  it('sets paused to true', () => {
    const player = createSpritesheetPlayer();
    pauseSpritesheetPlayer(player);
    expect(player.paused).toBe(true);
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

describe('releaseSpritesheetPlayer', () => {
  it('resets all fields to idle state', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1], 100);
    playSpritesheetAnimation(player, anim);
    player.elapsed = 80;
    player.speed = 3;
    player.paused = true;
    releaseSpritesheetPlayer(player);
    expect(player.animation).toBeNull();
    expect(player.complete).toBe(true);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.paused).toBe(false);
    expect(player.speed).toBe(1);
    expect(player.queue).toHaveLength(0);
  });

  it('disconnects signals so they do not fire after release', () => {
    const player = createSpritesheetPlayer();
    let fired = 0;
    connectSignal(player.onComplete, () => fired++);
    releaseSpritesheetPlayer(player);
    player.onComplete.emit();
    expect(fired).toBe(0);
  });
});

describe('resumeSpritesheetPlayer', () => {
  it('sets paused to false', () => {
    const player = createSpritesheetPlayer({ paused: true });
    resumeSpritesheetPlayer(player);
    expect(player.paused).toBe(false);
  });
});

describe('seekSpritesheetPlayerToFrame', () => {
  it('sets frameIndex to the target frame', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);
    seekSpritesheetPlayerToFrame(player, 2);
    expect(player.frameIndex).toBe(2);
  });

  it('clamps negative frame index to 0', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([0, 1, 2], 100));
    seekSpritesheetPlayerToFrame(player, -1);
    expect(player.frameIndex).toBe(0);
  });

  it('clamps frame index beyond last frame', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([0, 1, 2], 100));
    seekSpritesheetPlayerToFrame(player, 99);
    expect(player.frameIndex).toBe(2);
  });

  it('is a no-op when no animation is set', () => {
    const player = createSpritesheetPlayer();
    seekSpritesheetPlayerToFrame(player, 2);
    expect(player.frameIndex).toBe(0);
  });
});

describe('seekSpritesheetPlayerToTime', () => {
  it('sets elapsed to the given time', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);
    seekSpritesheetPlayerToTime(player, 250);
    expect(player.elapsed).toBe(250);
    expect(player.frameIndex).toBe(2);
  });

  it('clamps to 0', () => {
    const player = createSpritesheetPlayer();
    playSpritesheetAnimation(player, makeAnimation([0, 1, 2], 100));
    seekSpritesheetPlayerToTime(player, -50);
    expect(player.elapsed).toBe(0);
  });

  it('is a no-op when no animation is set', () => {
    const player = createSpritesheetPlayer();
    seekSpritesheetPlayerToTime(player, 100);
    expect(player.elapsed).toBe(0);
  });
});

describe('stopSpritesheetPlayer', () => {
  it('resets elapsed, frameIndex, and marks complete', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    const queued = makeAnimation([3], 100);
    playSpritesheetAnimation(player, anim);
    queueSpritesheetAnimation(player, queued);
    player.elapsed = 150;
    player.frameIndex = 1;
    stopSpritesheetPlayer(player);
    expect(player.elapsed).toBe(0);
    expect(player.frameIndex).toBe(0);
    expect(player.complete).toBe(true);
    expect(player.queue).toHaveLength(0);
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

  it('does not advance elapsed when paused', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    pauseSpritesheetPlayer(player);
    const result = updateSpritesheetPlayer(player, 200);
    expect(result).toBe(false);
    expect(player.elapsed).toBe(0);
  });

  it('advances elapsed again after resumeSpritesheetPlayer', () => {
    const player = createSpritesheetPlayer();
    const anim = makeAnimation([0, 1, 2], 100);
    playSpritesheetAnimation(player, anim);
    pauseSpritesheetPlayer(player);
    updateSpritesheetPlayer(player, 200);
    resumeSpritesheetPlayer(player);
    updateSpritesheetPlayer(player, 100);
    expect(player.elapsed).toBe(100);
  });

  it('scales elapsed time by speed', () => {
    const player = createSpritesheetPlayer({ speed: 2 });
    const anim = makeAnimation([0, 1, 2, 3], 100);
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 100);
    expect(player.elapsed).toBe(200);
    expect(player.frameIndex).toBe(2);
  });

  it('plays reverse direction in reverse frame order', () => {
    const player = createSpritesheetPlayer();
    const anim = createSpritesheetAnimation({
      direction: 'reverse',
      frameDuration: 100,
      frames: [0, 1, 2, 3],
      loop: true,
    });
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 0);
    expect(player.frameIndex).toBe(3);
    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(2);
  });

  it('plays pingpong direction forward then backward', () => {
    const player = createSpritesheetPlayer();
    const anim = createSpritesheetAnimation({
      direction: 'pingpong',
      frameDuration: 100,
      frames: [0, 1, 2],
      loop: true,
    });
    playSpritesheetAnimation(player, anim);
    // 6 virtual frames (0,1,2,1 wraps) at 100ms each = 600ms loop
    updateSpritesheetPlayer(player, 0);
    expect(player.frameIndex).toBe(0);
    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(1);
    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(2);
    updateSpritesheetPlayer(player, 100);
    expect(player.frameIndex).toBe(1);
  });

  it('uses per-frame durations when frameDurations is set', () => {
    const player = createSpritesheetPlayer();
    const anim = createSpritesheetAnimation({
      frameDuration: 100,
      frameDurations: [50, 200, 150],
      frames: [0, 1, 2],
      loop: true,
    });
    playSpritesheetAnimation(player, anim);
    updateSpritesheetPlayer(player, 50);
    expect(player.frameIndex).toBe(1); // 50ms into frame 1 (50..250)
    updateSpritesheetPlayer(player, 200);
    expect(player.frameIndex).toBe(2); // 250ms into frame 2 (250..400)
  });
});
