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
  invalidateNodeLocalTransform,
  setTextLabelString,
} from '@flighthq/sdk';
import {
  advanceAnimationLayerStack,
  createAnimationBlendTree,
  createAnimationBlendTreeInput,
  createAnimationBlendTreeLayer,
  createAnimationChannel,
  createAnimationClip,
  createAnimationLayerStack,
  createAnimationPlayer,
  createAnimationStateMachine,
  createAnimationStateMachineLayer,
  createAnimationStateMachineState,
  createAnimationTrack,
  isAnimationStateMachineTransitioning,
  sampleAnimationLayerStack,
  transitionAnimationStateMachine,
} from '@flighthq/sdk/animation';

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

// The walk clip deliberately shuffles channel order. State-machine correspondence follows targetRef
// identity, so the binding receives the right body/leg sample rather than relying on array position.
const walkClip = createAnimationClip([
  createAnimationChannel(quaternionTrack([28, -28, 28, -28, 28]), rightLegTarget),
  createAnimationChannel(createAnimationTrack({ times, values: [0, -12, 0, -12, 0] }), bodyTarget),
  createAnimationChannel(quaternionTrack([-28, 28, -28, 28, -28]), leftLegTarget),
]);

const runClip = createAnimationClip([
  createAnimationChannel(quaternionTrack([45, -45, 45, -45, 45]), rightLegTarget),
  createAnimationChannel(createAnimationTrack({ times, values: [0, -18, 0, -18, 0] }), bodyTarget),
  createAnimationChannel(quaternionTrack([-45, 45, -45, 45, -45]), leftLegTarget),
]);

const idlePlayer = createAnimationPlayer(idleClip);
const walkPlayer = createAnimationPlayer(walkClip);
const runPlayer = createAnimationPlayer(runClip);
const idleTree = createAnimationBlendTree([createAnimationBlendTreeInput(idlePlayer)]);
const locomotionTree = createAnimationBlendTree([
  createAnimationBlendTreeInput(walkPlayer, 0.7),
  createAnimationBlendTreeInput(runPlayer, 0.3),
]);
const stateMachine = createAnimationStateMachine([
  createAnimationStateMachineState('idle', idleTree),
  createAnimationStateMachineState('locomotion', locomotionTree),
]);
const accentTree = createAnimationBlendTree([
  createAnimationBlendTreeInput(
    createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ times, values: [0, -6, 0, -6, 0] }), bodyTarget),
        createAnimationChannel(quaternionTrack([12, -12, 12, -12, 12]), rightLegTarget),
      ]),
    ),
  ),
]);
const layers = createAnimationLayerStack([
  createAnimationStateMachineLayer(stateMachine),
  createAnimationBlendTreeLayer(accentTree, { additive: true, channelIndices: [0], weight: 0.5 }),
]);
transitionAnimationStateMachine(stateMachine, 'locomotion', 1.8, (t) => t * t * (3 - 2 * t));
const captureWindow = window as typeof window & { __flightCapture?: boolean };
if (captureWindow.__flightCapture) advanceAnimationLayerStack(layers, 0.9);
const sample = new Float32Array(4);

let bodyOffset = 0;
let leftLegAngle = 0;
let rightLegAngle = 0;

function readPose(): void {
  sampleAnimationLayerStack(sample, layers, (value, channel) => {
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

const scene2d = createShape();
addNodeChild(root, scene2d);

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

label('Animation State Machine', 24, 18, 26, 0xffffffff);
label('Idle -> N-way locomotion | masked additive body layer', 24, 54, 14, 0x9aa9c7ff);
label('IDLE', 86, 390, 14, 0x7086adff);
label('BLENDED POSE', 330, 390, 14, 0x63e6beff);
label('WALK/RUN', 644, 390, 14, 0xf0a85bff);
const status = label('', 250, 438, 15, 0xffffffff);

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

appendShapeLineStyle(scene2d, 2, 0x34405aff);
appendShapeMoveTo(scene2d, 30, 366);
appendShapeLineTo(scene2d, 770, 366);
drawCharacter(scene2d, 115, 265, -3, 3, 0x7086adff);
drawCharacter(scene2d, 685, 259, -28, 28, 0xf0a85bff);

function drawUpperBody(shape: Shape): void {
  appendShapeBeginFill(shape, 0x63e6beff);
  appendShapeCircle(shape, 0, -70, 18);
  appendShapeEndFill(shape);
  appendShapeLineStyle(shape, 8, 0x63e6beff);
  appendShapeMoveTo(shape, 0, -50);
  appendShapeLineTo(shape, 0, 12);
  appendShapeMoveTo(shape, 0, -32);
  appendShapeLineTo(shape, -26, -4);
  appendShapeMoveTo(shape, 0, -32);
  appendShapeLineTo(shape, 26, -4);
}

function drawLeg(shape: Shape, footDirection: number): void {
  appendShapeLineStyle(shape, 8, 0x63e6beff);
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
drawBar(barTrack, 0x2c3850ff);
barTrack.x = 240;
barTrack.y = 414;
invalidateNodeLocalTransform(barTrack);
addNodeChild(root, barTrack);

const barFill = createShape();
drawBar(barFill, 0x63e6beff);
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
  barFill.scaleX = Math.max(0.001, Math.min(1, stateMachine.transitionWeight));
  invalidateNodeLocalTransform(upperBody);
  invalidateNodeLocalTransform(leftLeg);
  invalidateNodeLocalTransform(rightLeg);
  invalidateNodeLocalTransform(barFill);
  setTextLabelString(
    status,
    isAnimationStateMachineTransitioning(stateMachine)
      ? `Idle -> locomotion  ${(stateMachine.transitionWeight * 100).toFixed(0)}%`
      : 'Locomotion | walk/run + masked body accent',
  );
}

let lastTime = performance.now();

function enterFrame(): void {
  requestAnimationFrame(enterFrame);
  const now = performance.now();
  const deltaTime = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  advanceAnimationLayerStack(layers, deltaTime);
  readPose();
  updateFrame();
  render(root);
}

readPose();
updateFrame();

// Capture holds the authored midpoint rather than advancing it by an environment-dependent rAF delta.
// Queue the fixed frame count as no-ops so the harness can stop deterministically without mutating the pose.
if (captureWindow.__flightCapture) {
  render(root);
  for (let frame = 0; frame < 32; frame++) requestAnimationFrame(() => {});
} else {
  requestAnimationFrame(enterFrame);
}
