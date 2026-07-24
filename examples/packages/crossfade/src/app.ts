import {
  advanceAnimationCrossfade,
  createAnimationChannel,
  createAnimationClip,
  createAnimationCrossfade,
  createAnimationPlayer,
  createAnimationTrack,
  isAnimationCrossfadeComplete,
  sampleAnimationCrossfade,
} from '@flighthq/animation';
import type { Shape, TextLabel } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

const bodyTarget = {};
const leftLegTarget = {};
const rightLegTarget = {};
const times = [0, 0.5, 1, 1.5, 2];

function quaternionValues(angles: readonly number[]): number[] {
  const values: number[] = [];
  for (const angle of angles) {
    const halfAngle = (angle * Math.PI) / 360;
    values.push(0, 0, Math.sin(halfAngle), Math.cos(halfAngle));
  }
  return values;
}

function quaternionTrack(angles: readonly number[]) {
  return createAnimationTrack({
    components: 4,
    quaternion: true,
    times,
    values: quaternionValues(angles),
  });
}

const idleClip = createAnimationClip([
  createAnimationChannel(createAnimationTrack({ times, values: [0, -1, 0, -1, 0] }), bodyTarget),
  createAnimationChannel(quaternionTrack([-3, 3, -3, 3, -3]), leftLegTarget),
  createAnimationChannel(quaternionTrack([3, -3, 3, -3, 3]), rightLegTarget),
]);

// The walk clip deliberately shuffles channel order. Crossfade correspondence follows targetRef
// identity, so the binding receives the right body/leg sample rather than relying on array position.
const walkClip = createAnimationClip([
  createAnimationChannel(quaternionTrack([28, -28, 28, -28, 28]), rightLegTarget),
  createAnimationChannel(createAnimationTrack({ times, values: [0, -12, 0, -12, 0] }), bodyTarget),
  createAnimationChannel(quaternionTrack([-28, 28, -28, 28, -28]), leftLegTarget),
]);

const idlePlayer = createAnimationPlayer(idleClip);
const walkPlayer = createAnimationPlayer(walkClip);
const crossfade = createAnimationCrossfade(idlePlayer, walkPlayer, 1.8, {
  curve: (t) => t * t * (3 - 2 * t),
});
const captureWindow = window as typeof window & { __flightCapture?: boolean };
if (captureWindow.__flightCapture) advanceAnimationCrossfade(crossfade, 0.9);
const sample = new Float32Array(4);

let bodyOffset = 0;
let leftLegAngle = 0;
let rightLegAngle = 0;

function readPose(): void {
  sampleAnimationCrossfade(sample, crossfade, (value, channel) => {
    if (channel.targetRef === bodyTarget) bodyOffset = value[0];
    else {
      const angle = (2 * Math.atan2(value[2], value[3]) * 180) / Math.PI;
      if (channel.targetRef === leftLegTarget) leftLegAngle = angle;
      else if (channel.targetRef === rightLegTarget) rightLegAngle = angle;
    }
  });
}

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const stage = createShape();
addNodeChild(root, stage);

function label(text: string, x: number, y: number, size: number, color: number): TextLabel {
  const result = createTextLabel();
  result.data.text = text;
  result.data.textFormat = { color, font: 'monospace', size };
  result.x = x;
  result.y = y;
  invalidateNodeLocalTransform(result);
  addNodeChild(root, result);
  return result;
}

label('Animation Crossfade', 24, 18, 26, 0xffffff);
label('Two explicit players | target-matched channels | quaternion slerp', 24, 54, 14, 0x9aa9c7);
label('IDLE', 86, 390, 14, 0x7086ad);
label('BLENDED POSE', 330, 390, 14, 0x63e6be);
label('WALK', 664, 390, 14, 0xf0a85b);
const status = label('', 250, 438, 15, 0xffffff);

function pointFromLeg(x: number, y: number, length: number, angle: number): readonly [number, number] {
  const radians = ((90 + angle) * Math.PI) / 180;
  return [x + Math.cos(radians) * length, y + Math.sin(radians) * length];
}

function drawCharacter(shape: Shape, x: number, y: number, leftAngle: number, rightAngle: number, color: number): void {
  appendShapeBeginFill(shape, color);
  appendShapeCircle(shape, x, y - 70, 18);
  appendShapeEndFill(shape);
  appendShapeLineStyle(shape, 8, color);
  appendShapeMoveTo(shape, x, y - 50);
  appendShapeLineTo(shape, x, y + 12);
  appendShapeMoveTo(shape, x, y - 32);
  appendShapeLineTo(shape, x - 26, y - 4);
  appendShapeMoveTo(shape, x, y - 32);
  appendShapeLineTo(shape, x + 26, y - 4);
  const leftKnee = pointFromLeg(x - 4, y + 10, 43, leftAngle);
  const rightKnee = pointFromLeg(x + 4, y + 10, 43, rightAngle);
  appendShapeMoveTo(shape, x - 4, y + 10);
  appendShapeLineTo(shape, leftKnee[0], leftKnee[1]);
  appendShapeLineTo(shape, leftKnee[0] - 12, leftKnee[1] + 38);
  appendShapeMoveTo(shape, x + 4, y + 10);
  appendShapeLineTo(shape, rightKnee[0], rightKnee[1]);
  appendShapeLineTo(shape, rightKnee[0] + 12, rightKnee[1] + 38);
}

appendShapeLineStyle(stage, 2, 0x34405a);
appendShapeMoveTo(stage, 30, 366);
appendShapeLineTo(stage, 770, 366);
drawCharacter(stage, 115, 265, -3, 3, 0x7086ad);
drawCharacter(stage, 685, 259, -28, 28, 0xf0a85b);

function drawUpperBody(shape: Shape): void {
  appendShapeBeginFill(shape, 0x63e6be);
  appendShapeCircle(shape, 0, -70, 18);
  appendShapeEndFill(shape);
  appendShapeLineStyle(shape, 8, 0x63e6be);
  appendShapeMoveTo(shape, 0, -50);
  appendShapeLineTo(shape, 0, 12);
  appendShapeMoveTo(shape, 0, -32);
  appendShapeLineTo(shape, -26, -4);
  appendShapeMoveTo(shape, 0, -32);
  appendShapeLineTo(shape, 26, -4);
}

function drawLeg(shape: Shape, footDirection: number): void {
  appendShapeLineStyle(shape, 8, 0x63e6be);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, 0, 43);
  appendShapeLineTo(shape, footDirection * 12, 81);
}

function drawBar(shape: Shape, color: number): void {
  appendShapeBeginFill(shape, color);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, 320, 0);
  appendShapeLineTo(shape, 320, 12);
  appendShapeLineTo(shape, 0, 12);
  appendShapeEndFill(shape);
}

const upperBody = createShape();
drawUpperBody(upperBody);
addNodeChild(root, upperBody);

const leftLeg = createShape();
drawLeg(leftLeg, -1);
addNodeChild(root, leftLeg);

const rightLeg = createShape();
drawLeg(rightLeg, 1);
addNodeChild(root, rightLeg);

const barTrack = createShape();
drawBar(barTrack, 0x2c3850);
barTrack.x = 240;
barTrack.y = 414;
invalidateNodeLocalTransform(barTrack);
addNodeChild(root, barTrack);

const barFill = createShape();
drawBar(barFill, 0x63e6be);
barFill.x = 240;
barFill.y = 414;
barFill.scaleX = 0.001;
invalidateNodeLocalTransform(barFill);
addNodeChild(root, barFill);

function updateFrame(): void {
  const y = 265 + bodyOffset;
  upperBody.x = 400;
  upperBody.y = y;
  leftLeg.x = 396;
  leftLeg.y = y + 10;
  leftLeg.rotation = leftLegAngle;
  rightLeg.x = 404;
  rightLeg.y = y + 10;
  rightLeg.rotation = rightLegAngle;
  barFill.scaleX = Math.max(0.001, Math.min(1, crossfade.weight));
  invalidateNodeLocalTransform(upperBody);
  invalidateNodeLocalTransform(leftLeg);
  invalidateNodeLocalTransform(rightLeg);
  invalidateNodeLocalTransform(barFill);
  status.data.text = isAnimationCrossfadeComplete(crossfade)
    ? 'Transition complete | destination player continues'
    : `Idle -> walk  ${(crossfade.weight * 100).toFixed(0)}%`;
  invalidateNodeAppearance(status);
}

let lastTime = performance.now();

function enterFrame(): void {
  requestAnimationFrame(enterFrame);
  const now = performance.now();
  const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  advanceAnimationCrossfade(crossfade, deltaTime);
  readPose();
  updateFrame();
  render(root);
}

readPose();
updateFrame();
requestAnimationFrame(enterFrame);

// Deterministic capture requests a fixed frame count. Queue additional callbacks together so browser
// background-frame throttling cannot stretch that fixed count beyond the harness timeout.
if (captureWindow.__flightCapture) {
  for (let frame = 0; frame < 32; frame++) requestAnimationFrame(() => {});
}
