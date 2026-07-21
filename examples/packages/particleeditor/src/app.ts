import type { ParticleEmitterConfig, ParticleForce } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  applyParticleForces,
  BlendMode,
  buildParticleCurve,
  createDisplayObject,
  createImageResource,
  createParticleEmitter2D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createTextLabel,
  createTextureAtlas,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  particleColorCurveFromKeyframes,
  updateParticleEmitter2D,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const WIDTH = 800;
const HEIGHT = 600;

const root = createDisplayObject();

// Procedural radial glow particle texture.
const particleCanvas = document.createElement('canvas');
particleCanvas.width = 16;
particleCanvas.height = 16;
const pCtx = particleCanvas.getContext('2d')!;
const grad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
grad.addColorStop(0.3, 'rgba(255, 220, 120, 1)');
grad.addColorStop(0.6, 'rgba(255, 100, 30, 0.7)');
grad.addColorStop(1, 'rgba(200, 40, 0, 0)');
pCtx.fillStyle = grad;
pCtx.fillRect(0, 0, 16, 16);

const atlas = createTextureAtlas({ image: createImageResource(particleCanvas) });
addTextureAtlasRegion(atlas, 0, 0, 16, 16);

const emitter = createParticleEmitter2D();
emitter.data.atlas = atlas;
emitter.blendMode = BlendMode.Add;
emitter.scaleX = 1;
emitter.scaleY = 1;
emitter.x = (WIDTH * scale) / 2;
emitter.y = (HEIGHT * scale) / 2;
addNodeChild(root, emitter);

const countLabel = createTextLabel();
countLabel.data.text = '0 particles';
countLabel.data.textFormat = { size: 12, color: 0x999999 };
countLabel.x = 8 * scale;
countLabel.y = (HEIGHT - 20) * scale;
invalidateNodeLocalTransform(countLabel);
addNodeChild(root, countLabel);

// Editable config values — these drive `createParticleEmitterConfig` each time a slider changes.
const editable: Record<string, number> = {
  spawnRate: 120,
  lifetimeMin: 0.3,
  lifetimeMax: 0.8,
  speedMin: 40,
  speedMax: 120,
  scaleMin: 0.4,
  scaleMax: 1.2,
  alphaStart: 1,
  alphaEnd: 0,
  spread: 360,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 100,
  rotationSpeedMin: 0,
  rotationSpeedMax: 0,
  maxParticles: 2000,
  dragStrength: 0.5,
  turbulenceStrength: 40,
};

// Color state (stored separately since they are RGB components).
let colorStartR = 1;
let colorStartG = 0.85;
let colorStartB = 0.4;
let colorEndR = 0.6;
let colorEndG = 0.05;
let colorEndB = 0;
let useBlendAdd = true;

function rebuildConfig(): ParticleEmitterConfig {
  const alphaCurve = buildParticleCurve((t) => editable.alphaStart + (editable.alphaEnd - editable.alphaStart) * t);
  const scaleCurve = buildParticleCurve((t) => 1 - t * 0.6);
  const colorCurve = particleColorCurveFromKeyframes([
    { time: 0, r: colorStartR, g: colorStartG, b: colorStartB },
    { time: 1, r: colorEndR, g: colorEndG, b: colorEndB },
  ]);

  return createParticleEmitterConfig({
    worldSpace: true,
    spawnRate: editable.spawnRate,
    lifetimeMin: editable.lifetimeMin,
    lifetimeMax: editable.lifetimeMax,
    speedMin: editable.speedMin * scale,
    speedMax: editable.speedMax * scale,
    scaleMin: editable.scaleMin * scale,
    scaleMax: editable.scaleMax * scale,
    spread: (editable.spread / 180) * Math.PI,
    directionX: editable.directionX,
    directionY: editable.directionY,
    gravityX: editable.gravityX * scale,
    gravityY: editable.gravityY * scale,
    rotationSpeedMin: editable.rotationSpeedMin,
    rotationSpeedMax: editable.rotationSpeedMax,
    maxParticles: editable.maxParticles,
    alphaCurve,
    scaleCurve,
    colorCurve,
  });
}

function rebuildForces(): readonly ParticleForce[] {
  const forces: ParticleForce[] = [];
  if (editable.dragStrength > 0) {
    forces.push({ kind: 'DragForce', strength: editable.dragStrength });
  }
  if (editable.turbulenceStrength > 0) {
    forces.push({ kind: 'TurbulenceForce', strength: editable.turbulenceStrength * scale, scale: 0.01 });
  }
  return forces;
}

let config = rebuildConfig();
let forces = rebuildForces();
const simState = createParticleEmitterState();

// Control panel construction.
interface SliderDef {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const controlSections: readonly { readonly heading: string; readonly controls: readonly SliderDef[] }[] = [
  {
    heading: 'Emission',
    controls: [
      { key: 'spawnRate', label: 'Spawn rate', min: 1, max: 500, step: 1 },
      { key: 'maxParticles', label: 'Max particles', min: 100, max: 5000, step: 100 },
    ],
  },
  {
    heading: 'Lifetime',
    controls: [
      { key: 'lifetimeMin', label: 'Lifetime min (s)', min: 0.05, max: 5, step: 0.05 },
      { key: 'lifetimeMax', label: 'Lifetime max (s)', min: 0.05, max: 5, step: 0.05 },
    ],
  },
  {
    heading: 'Speed',
    controls: [
      { key: 'speedMin', label: 'Speed min', min: 0, max: 400, step: 5 },
      { key: 'speedMax', label: 'Speed max', min: 0, max: 400, step: 5 },
    ],
  },
  {
    heading: 'Scale',
    controls: [
      { key: 'scaleMin', label: 'Scale min', min: 0.05, max: 4, step: 0.05 },
      { key: 'scaleMax', label: 'Scale max', min: 0.05, max: 4, step: 0.05 },
    ],
  },
  {
    heading: 'Alpha',
    controls: [
      { key: 'alphaStart', label: 'Alpha start', min: 0, max: 1, step: 0.05 },
      { key: 'alphaEnd', label: 'Alpha end', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    heading: 'Direction',
    controls: [
      { key: 'spread', label: 'Spread (deg)', min: 0, max: 360, step: 5 },
      { key: 'directionX', label: 'Direction X', min: -1, max: 1, step: 0.1 },
      { key: 'directionY', label: 'Direction Y', min: -1, max: 1, step: 0.1 },
    ],
  },
  {
    heading: 'Gravity',
    controls: [
      { key: 'gravityX', label: 'Gravity X', min: -500, max: 500, step: 10 },
      { key: 'gravityY', label: 'Gravity Y', min: -500, max: 500, step: 10 },
    ],
  },
  {
    heading: 'Rotation',
    controls: [
      { key: 'rotationSpeedMin', label: 'Rotation min', min: -10, max: 10, step: 0.5 },
      { key: 'rotationSpeedMax', label: 'Rotation max', min: -10, max: 10, step: 0.5 },
    ],
  },
  {
    heading: 'Forces',
    controls: [
      { key: 'dragStrength', label: 'Drag', min: 0, max: 3, step: 0.1 },
      { key: 'turbulenceStrength', label: 'Turbulence', min: 0, max: 200, step: 5 },
    ],
  },
];

const controlsDiv =
  document.getElementById('controls') ??
  (() => {
    const div = document.createElement('div');
    div.id = 'controls';
    document.body.appendChild(div);
    return div;
  })();

controlsDiv.style.backgroundColor = '#1a1a2e';
controlsDiv.style.color = '#e0e0e0';
controlsDiv.style.padding = '12px';
controlsDiv.style.fontFamily = 'system-ui, sans-serif';
controlsDiv.style.fontSize = '13px';

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function onConfigChange(): void {
  config = rebuildConfig();
  forces = rebuildForces();
  emitter.blendMode = useBlendAdd ? BlendMode.Add : BlendMode.Normal;
}

for (const section of controlSections) {
  const heading = document.createElement('h3');
  heading.textContent = section.heading;
  controlsDiv.appendChild(heading);

  for (const ctrl of section.controls) {
    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = ctrl.label;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.textContent = formatValue(editable[ctrl.key]);
    label.appendChild(nameSpan);
    label.appendChild(valueSpan);
    controlsDiv.appendChild(label);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(ctrl.min);
    input.max = String(ctrl.max);
    input.step = String(ctrl.step);
    input.value = String(editable[ctrl.key]);
    input.addEventListener('input', () => {
      editable[ctrl.key] = Number(input.value);
      valueSpan.textContent = formatValue(editable[ctrl.key]);
      onConfigChange();
    });
    controlsDiv.appendChild(input);
  }
}

// Color controls.
const colorHeading = document.createElement('h3');
colorHeading.textContent = 'Color';
controlsDiv.appendChild(colorHeading);

function rgbToHex(r: number, g: number, b: number): string {
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

function addColorPicker(
  labelText: string,
  initialHex: string,
  onChange: (r: number, g: number, b: number) => void,
): void {
  const label = document.createElement('label');
  const nameSpan = document.createElement('span');
  nameSpan.textContent = labelText;
  label.appendChild(nameSpan);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = initialHex;
  input.addEventListener('input', () => {
    const { r, g, b } = hexToRgb(input.value);
    onChange(r, g, b);
    onConfigChange();
  });
  label.appendChild(input);
  controlsDiv.appendChild(label);
}

addColorPicker('Start color', rgbToHex(colorStartR, colorStartG, colorStartB), (r, g, b) => {
  colorStartR = r;
  colorStartG = g;
  colorStartB = b;
});

addColorPicker('End color', rgbToHex(colorEndR, colorEndG, colorEndB), (r, g, b) => {
  colorEndR = r;
  colorEndG = g;
  colorEndB = b;
});

// Blend mode toggle.
const blendHeading = document.createElement('h3');
blendHeading.textContent = 'Blend Mode';
controlsDiv.appendChild(blendHeading);

const blendSelect = document.createElement('select');
const addOption = blendSelect.appendChild.bind(blendSelect);
for (const name of ['Add', 'Normal']) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  addOption(opt);
}
blendSelect.value = 'Add';
blendSelect.addEventListener('change', () => {
  useBlendAdd = blendSelect.value === 'Add';
  onConfigChange();
});
controlsDiv.appendChild(blendSelect);

// Mouse tracking — emitter follows the pointer.
let mouseX = (WIDTH * scale) / 2;
let mouseY = (HEIGHT * scale) / 2;

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (WIDTH / rect.width) * scale;
  mouseY = (e.clientY - rect.top) * (HEIGHT / rect.height) * scale;
});

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Snap emitter to mouse position.
  emitter.x = mouseX;
  emitter.y = mouseY;
  invalidateNodeLocalTransform(emitter);

  // World-space emitter bakes spawns through its own node world transform (set above), so nothing to pass.
  applyParticleForces(emitter, simState, forces, dt);
  updateParticleEmitter2D(emitter, simState, config, dt);
  invalidateNodeAppearance(emitter);

  countLabel.data.text = `${emitter.data.particleCount} particles`;
  invalidateNodeAppearance(countLabel);

  render(root);
  requestAnimationFrame(enterFrame);
}

invalidateNodeLocalTransform(emitter);
enterFrame();
