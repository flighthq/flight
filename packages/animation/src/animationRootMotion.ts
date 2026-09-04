import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AnimationClip, AnimationRootMotionExtractor } from '@flighthq/types/contract';

import { sampleAnimationTrack } from './animationTrack';

// Allocates reusable extraction scratch for one root channel. Channel selection is explicit and
// target-free: the animation core never inspects a scene path or applies the resulting motion.
export function createAnimationRootMotionExtractor(
  clip: Readonly<AnimationClip>,
  channelIndex: number,
): AnimationRootMotionExtractor {
  if (!Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= clip.channels.length) {
    throw new RangeError(`AnimationRootMotionExtractor channel index ${String(channelIndex)} does not exist.`);
  }
  const channel = clip.channels[channelIndex];
  const width = channel.track.components;
  if (channel.track.quaternion && width !== 4) {
    throw new TypeError('AnimationRootMotionExtractor quaternion channel must have four components.');
  }
  const extractor = allocateEntity<AnimationRootMotionExtractor>();
  extractor.channel = channel;
  extractor.channelIndex = channelIndex;
  extractor.clip = clip;
  extractor.cycleDelta = new Float32Array(width);
  extractor.fromMotion = new Float32Array(width);
  extractor.fromSample = new Float32Array(width);
  extractor.powerScratch = new Float32Array(width);
  extractor.startSample = new Float32Array(width);
  extractor.toMotion = new Float32Array(width);
  extractor.toSample = new Float32Array(width);
  sampleAnimationTrack(extractor.startSample, channel.track, 0);
  sampleAnimationTrack(extractor.toSample, channel.track, clip.duration);
  writeAnimationRootMotionDelta(
    extractor.cycleDelta,
    extractor.startSample,
    extractor.toSample,
    channel.track.quaternion,
  );
  return extractor;
}

// Writes the accumulated root delta from finite unwrapped `startTime` to `endTime`. Times may cross
// any number of repeat boundaries or run backward. Vector deltas add complete-cycle displacement;
// quaternion deltas compose complete-cycle rotation. Returns false without changing `out` if too short.
export function extractAnimationRootMotion(
  out: number[] | Float32Array,
  extractor: AnimationRootMotionExtractor,
  startTime: number,
  endTime: number,
): boolean {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new RangeError('AnimationRootMotionExtractor time range must contain only finite numbers.');
  }
  const components = extractor.channel.track.components;
  if (out.length < components) return false;
  writeAnimationRootMotionAt(extractor.fromMotion, extractor, startTime, extractor.fromSample);
  writeAnimationRootMotionAt(extractor.toMotion, extractor, endTime, extractor.toSample);
  writeAnimationRootMotionDelta(out, extractor.fromMotion, extractor.toMotion, extractor.channel.track.quaternion);
  return true;
}

function multiplyAnimationRootMotionQuaternion(
  out: number[] | Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): void {
  const ax = a[0],
    ay = a[1],
    az = a[2],
    aw = a[3];
  const bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  writeNormalizedAnimationRootMotionQuaternion(
    out,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

function writeAnimationRootMotionAt(
  out: Float32Array,
  extractor: AnimationRootMotionExtractor,
  time: number,
  sample: Float32Array,
): void {
  const duration = extractor.clip.duration;
  const track = extractor.channel.track;
  if (!(duration > 0)) {
    writeAnimationRootMotionIdentity(out, track.components, track.quaternion);
    return;
  }
  const cycle = Math.floor(time / duration);
  const localTime = time - cycle * duration;
  sampleAnimationTrack(sample, track, localTime);
  if (track.quaternion) {
    writeAnimationRootMotionQuaternionPower(out, extractor, cycle);
    writeAnimationRootMotionDelta(extractor.powerScratch, extractor.startSample, sample, true);
    multiplyAnimationRootMotionQuaternion(out, out, extractor.powerScratch);
    return;
  }
  for (let component = 0; component < track.components; component++) {
    out[component] = sample[component] - extractor.startSample[component] + extractor.cycleDelta[component] * cycle;
  }
}

function writeAnimationRootMotionDelta(
  out: number[] | Float32Array,
  from: ArrayLike<number>,
  to: ArrayLike<number>,
  quaternion: boolean,
): void {
  if (!quaternion) {
    const width = Math.min(out.length, from.length, to.length);
    for (let component = 0; component < width; component++) out[component] = to[component] - from[component];
    return;
  }
  writeNormalizedAnimationRootMotionQuaternion(
    out,
    from[3] * to[0] - from[0] * to[3] - from[1] * to[2] + from[2] * to[1],
    from[3] * to[1] + from[0] * to[2] - from[1] * to[3] - from[2] * to[0],
    from[3] * to[2] - from[0] * to[1] + from[1] * to[0] - from[2] * to[3],
    from[3] * to[3] + from[0] * to[0] + from[1] * to[1] + from[2] * to[2],
  );
}

function writeAnimationRootMotionIdentity(out: number[] | Float32Array, components: number, quaternion: boolean): void {
  const width = Math.min(out.length, components);
  for (let component = 0; component < width; component++) out[component] = 0;
  if (quaternion && width >= 4) out[3] = 1;
}

function writeAnimationRootMotionQuaternionPower(
  out: Float32Array,
  extractor: AnimationRootMotionExtractor,
  exponent: number,
): void {
  writeAnimationRootMotionIdentity(out, 4, true);
  if (exponent === 0) return;
  const base = extractor.powerScratch;
  if (exponent > 0) {
    base.set(extractor.cycleDelta);
  } else {
    base[0] = -extractor.cycleDelta[0];
    base[1] = -extractor.cycleDelta[1];
    base[2] = -extractor.cycleDelta[2];
    base[3] = extractor.cycleDelta[3];
  }
  let remaining = Math.abs(exponent);
  while (remaining > 0) {
    if (remaining % 2 === 1) multiplyAnimationRootMotionQuaternion(out, out, base);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) multiplyAnimationRootMotionQuaternion(base, base, base);
  }
}

function writeNormalizedAnimationRootMotionQuaternion(
  out: number[] | Float32Array,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  const length = Math.hypot(x, y, z, w);
  if (!(length > 0)) {
    writeAnimationRootMotionIdentity(out, 4, true);
    return;
  }
  const inverseLength = 1 / length;
  out[0] = x * inverseLength;
  out[1] = y * inverseLength;
  out[2] = z * inverseLength;
  out[3] = w * inverseLength;
}
