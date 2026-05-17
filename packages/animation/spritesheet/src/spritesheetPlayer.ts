import type { Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer } from '@flighthq/types';

export function createSpritesheetPlayer(obj?: Partial<SpritesheetPlayer>): SpritesheetPlayer {
  return {
    animation: obj?.animation ?? null,
    complete: obj?.complete ?? true,
    elapsed: obj?.elapsed ?? 0,
    frameIndex: obj?.frameIndex ?? 0,
    queue: obj?.queue ?? [],
  };
}

export function getSpritesheetPlayerFrame(player: SpritesheetPlayer, spritesheet: Spritesheet): SpritesheetFrame | null {
  const { animation, frameIndex } = player;
  if (animation === null || animation.frames.length === 0) return null;
  const spriteFrameIndex = animation.frames[frameIndex];
  return spritesheet.frames[spriteFrameIndex] ?? null;
}

export function queueSpritesheetAnimation(player: SpritesheetPlayer, animation: SpritesheetAnimation): void {
  player.queue.push(animation);
}

export function showSpritesheetAnimation(
  player: SpritesheetPlayer,
  animation: SpritesheetAnimation | null,
  restart = true,
): void {
  if (!restart && animation === player.animation) return;
  player.animation = animation;
  player.complete = animation === null;
  player.elapsed = 0;
  player.frameIndex = 0;
  player.queue = [];
}

export function updateSpritesheetPlayer(player: SpritesheetPlayer, deltaTime: number): boolean {
  const { animation } = player;
  if (animation === null || player.complete || animation.frames.length === 0) return false;

  player.elapsed += deltaTime;

  const { frames, frameDuration, loop } = animation;
  const loopTime = frames.length * frameDuration;

  if (!loop && player.elapsed >= loopTime) {
    if (player.queue.length > 0) {
      const next = player.queue.shift()!;
      player.animation = next;
      player.elapsed = 0;
      player.frameIndex = 0;
      return true;
    }
    player.elapsed = loopTime;
    player.frameIndex = frames.length - 1;
    player.complete = true;
    return true;
  }

  const timeInLoop = player.elapsed % loopTime;
  player.frameIndex = Math.min(Math.floor(timeInLoop / frameDuration), frames.length - 1);
  return true;
}
