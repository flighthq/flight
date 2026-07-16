import type { AudioChannel, AudioResource, Shape } from '@flighthq/sdk';
import {
  addAudioBusToMixer,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  attachPointerInput,
  clearShapeCommands,
  connectInputToInteraction,
  connectInteractionSignal,
  createAudioBus,
  createAudioMixer,
  createAudioResourceFromSamples,
  createDisplayObject,
  createInputManager,
  createInteractionManager,
  createShape,
  createTextLabel,
  createWebCursorBackend,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  playAudioResource,
  registerDefaultHitTests,
  routeAudioChannelToMixerBus,
  setAudioBusGain,
  setAudioBusPan,
  setAudioMixerMasterGain,
  setNodeCursor,
  setNodeHitTestEnabled,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const SAMPLE_RATE = 44100;

// Procedurally generate a sine tone with exponential decay.
function generateTone(frequency: number, duration: number, decay: number): AudioResource {
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-decay * t);
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
  }
  return createAudioResourceFromSamples([samples], SAMPLE_RATE);
}

// Procedurally generate a frequency sweep with linear interpolation.
function generateSweep(startFreq: number, endFreq: number, duration: number, decay: number): AudioResource {
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = startFreq + (endFreq - startFreq) * (t / duration);
    const envelope = Math.exp(-decay * t);
    samples[i] = Math.sin(phase) * envelope;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
  }
  return createAudioResourceFromSamples([samples], SAMPLE_RATE);
}

const clickSound = generateTone(440, 0.15, 20);
const blipSound = generateTone(880, 0.08, 40);
const sweepSound = generateSweep(200, 800, 0.3, 6);

// Web Audio requires a user gesture to start. The AudioContext is created once and resumed on
// the first pointer interaction.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (audioContext === null) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// Scene graph root, scaled to device pixel ratio.
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Interaction setup: register hit test handlers and wire DOM events. The manager gets a cursor
// backend so a node's `setNodeCursor` shows through on rollover (the buttons/sliders below opt in).
registerDefaultHitTests();
const canvasElement = canvas;
const interactionManager = createInteractionManager(root, {
  cursorBackend: createWebCursorBackend(canvasElement),
});
const inputManager = createInputManager();
attachPointerInput(inputManager, canvasElement);
connectInputToInteraction(inputManager, interactionManager, scale);

// Audio mixer with two buses: sfx and music.
let mixer: ReturnType<typeof createAudioMixer> | null = null;
const sfxBus = createAudioBus({ name: 'sfx', gain: 0.8 });
const musicBus = createAudioBus({ name: 'music', gain: 0.6 });

function ensureMixer(): ReturnType<typeof createAudioMixer> {
  if (mixer === null) {
    mixer = createAudioMixer(getAudioContext());
    addAudioBusToMixer(mixer, sfxBus);
    addAudioBusToMixer(mixer, musicBus);
  }
  return mixer;
}

// Play a sound through the sfx bus.
function playSfx(resource: AudioResource, gain: number, pan: number): AudioChannel | null {
  const ctx = getAudioContext();
  const channel = playAudioResource(ctx, resource, { gain });
  if (channel !== null) {
    routeAudioChannelToMixerBus(ensureMixer(), channel, sfxBus);
  }
  void pan;
  return channel;
}

// Button definitions.
interface SoundButton {
  shape: Shape;
  label: string;
  color: number;
  hoverColor: number;
  x: number;
  y: number;
  w: number;
  h: number;
  resource: AudioResource;
  pan: number;
}

const BUTTON_Y = 120;
const BUTTON_W = 180;
const BUTTON_H = 80;
const BUTTON_GAP = 40;

const buttons: SoundButton[] = [
  {
    shape: createShape(),
    label: 'Click (440 Hz)',
    color: 0x3a7bd5,
    hoverColor: 0x5a9bf5,
    x: 60,
    y: BUTTON_Y,
    w: BUTTON_W,
    h: BUTTON_H,
    resource: clickSound,
    pan: -0.5,
  },
  {
    shape: createShape(),
    label: 'Blip (880 Hz)',
    color: 0x2ecc71,
    hoverColor: 0x4eec91,
    x: 60 + BUTTON_W + BUTTON_GAP,
    y: BUTTON_Y,
    w: BUTTON_W,
    h: BUTTON_H,
    resource: blipSound,
    pan: 0,
  },
  {
    shape: createShape(),
    label: 'Sweep (200-800 Hz)',
    color: 0xe74c3c,
    hoverColor: 0xf76c5c,
    x: 60 + (BUTTON_W + BUTTON_GAP) * 2,
    y: BUTTON_Y,
    w: BUTTON_W,
    h: BUTTON_H,
    resource: sweepSound,
    pan: 0.5,
  },
];

// Volume slider bar: a horizontal bar that controls the master gain.
const SLIDER_X = 60;
const SLIDER_Y = 280;
const SLIDER_W = 680;
const SLIDER_H = 30;
let masterGain = 0.7;

const sliderTrack = createShape();
const sliderFill = createShape();
const sliderHandle = createShape();

// Bus gain control sliders.
const BUS_SLIDER_Y = 380;
const BUS_SLIDER_W = 300;
const BUS_SLIDER_H = 24;

const sfxSliderTrack = createShape();
const sfxSliderFill = createShape();
const musicSliderTrack = createShape();
const musicSliderFill = createShape();

// Bus pan control sliders.
const PAN_SLIDER_Y = 450;

const sfxPanTrack = createShape();
const sfxPanFill = createShape();
const musicPanTrack = createShape();
const musicPanFill = createShape();

// Hovered state tracking.
const hoveredButtons = new Set<SoundButton>();

function drawButton(btn: SoundButton): void {
  const isHovered = hoveredButtons.has(btn);
  const color = isHovered ? btn.hoverColor : btn.color;
  clearShapeCommands(btn.shape);
  appendShapeBeginFill(btn.shape, color, 0.9);
  appendShapeRectangle(btn.shape, btn.x, btn.y, btn.w, btn.h);
  appendShapeEndFill(btn.shape);
  invalidateNodeLocalTransform(btn.shape);
}

function drawSliderBar(
  track: Shape,
  fill: Shape,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  trackColor: number,
  fillColor: number,
): void {
  clearShapeCommands(track);
  appendShapeBeginFill(track, trackColor, 0.4);
  appendShapeRectangle(track, x, y, w, h);
  appendShapeEndFill(track);
  invalidateNodeLocalTransform(track);

  clearShapeCommands(fill);
  appendShapeBeginFill(fill, fillColor, 0.8);
  appendShapeRectangle(fill, x, y, Math.max(1, w * ratio), h);
  appendShapeEndFill(fill);
  invalidateNodeLocalTransform(fill);
}

function drawPanBar(
  track: Shape,
  fill: Shape,
  x: number,
  y: number,
  w: number,
  h: number,
  pan: number,
  trackColor: number,
  fillColor: number,
): void {
  clearShapeCommands(track);
  appendShapeBeginFill(track, trackColor, 0.4);
  appendShapeRectangle(track, x, y, w, h);
  appendShapeEndFill(track);
  invalidateNodeLocalTransform(track);

  // Pan ranges from -1 to 1. Draw a bar from center to the pan position.
  const center = x + w / 2;
  const panOffset = (pan / 2 + 0.5) * w;
  const barX = Math.min(center, x + panOffset);
  const barW = Math.abs(panOffset - w / 2);
  clearShapeCommands(fill);
  appendShapeBeginFill(fill, fillColor, 0.8);
  appendShapeRectangle(fill, barX, y, Math.max(1, barW), h);
  appendShapeEndFill(fill);
  invalidateNodeLocalTransform(fill);
}

function drawMasterSlider(): void {
  drawSliderBar(sliderTrack, sliderFill, SLIDER_X, SLIDER_Y, SLIDER_W, SLIDER_H, masterGain, 0x444444, 0xdddddd);

  clearShapeCommands(sliderHandle);
  const handleX = SLIDER_X + SLIDER_W * masterGain - 4;
  appendShapeBeginFill(sliderHandle, 0xffffff, 1);
  appendShapeRectangle(sliderHandle, handleX, SLIDER_Y - 4, 8, SLIDER_H + 8);
  appendShapeEndFill(sliderHandle);
  invalidateNodeLocalTransform(sliderHandle);
}

function drawBusSliders(): void {
  drawSliderBar(
    sfxSliderTrack,
    sfxSliderFill,
    SLIDER_X,
    BUS_SLIDER_Y,
    BUS_SLIDER_W,
    BUS_SLIDER_H,
    sfxBus.gain,
    0x444444,
    0x3a7bd5,
  );
  drawSliderBar(
    musicSliderTrack,
    musicSliderFill,
    SLIDER_X + BUS_SLIDER_W + 80,
    BUS_SLIDER_Y,
    BUS_SLIDER_W,
    BUS_SLIDER_H,
    musicBus.gain,
    0x444444,
    0x2ecc71,
  );
}

function drawPanSliders(): void {
  drawPanBar(
    sfxPanTrack,
    sfxPanFill,
    SLIDER_X,
    PAN_SLIDER_Y,
    BUS_SLIDER_W,
    BUS_SLIDER_H,
    sfxBus.pan,
    0x444444,
    0x3a7bd5,
  );
  drawPanBar(
    musicPanTrack,
    musicPanFill,
    SLIDER_X + BUS_SLIDER_W + 80,
    PAN_SLIDER_Y,
    BUS_SLIDER_W,
    BUS_SLIDER_H,
    musicBus.pan,
    0x444444,
    0x2ecc71,
  );
}

// Initialize scene graph: add buttons, sliders, and labels. Hit testing is opt-in — only the nodes
// that call `setNodeHitTestEnabled(node, true)` are candidates, so the labels and slider fills drawn
// on top of the buttons/tracks are transparent to the pointer for free (they never opt in). Each
// button opts in and shows the pointer (hand) cursor on rollover via the manager's cursor backend.
for (const btn of buttons) {
  addNodeChild(root, btn.shape);
  setNodeHitTestEnabled(btn.shape, true);
  setNodeCursor(btn.shape, 'pointer');
  drawButton(btn);
}

addNodeChild(root, sliderTrack);
addNodeChild(root, sliderFill);
addNodeChild(root, sliderHandle);
addNodeChild(root, sfxSliderTrack);
addNodeChild(root, sfxSliderFill);
addNodeChild(root, musicSliderTrack);
addNodeChild(root, musicSliderFill);
addNodeChild(root, sfxPanTrack);
addNodeChild(root, sfxPanFill);
addNodeChild(root, musicPanTrack);
addNodeChild(root, musicPanFill);

// Only the tracks opt into hit testing; their fills/handle overlays never do, so a click on the
// filled half passes through to the track underneath and the whole bar stays draggable. The tracks
// also show a horizontal-resize cursor on rollover to read as draggable.
for (const track of [sliderTrack, sfxSliderTrack, musicSliderTrack, sfxPanTrack, musicPanTrack]) {
  setNodeHitTestEnabled(track, true);
  setNodeCursor(track, 'ew-resize');
}

drawMasterSlider();
drawBusSliders();
drawPanSliders();

// Labels.
const titleLabel = createTextLabel();
titleLabel.data.text = 'Sound Example - Procedural Audio & Mixer';
titleLabel.data.textFormat = { size: 18, color: 0xcccccc };
titleLabel.x = 60;
titleLabel.y = 30;
invalidateNodeLocalTransform(titleLabel);
addNodeChild(root, titleLabel);

const instructionLabel = createTextLabel();
instructionLabel.data.text = 'Click the buttons to play procedurally generated tones.';
instructionLabel.data.textFormat = { size: 13, color: 0x888888 };
instructionLabel.x = 60;
instructionLabel.y = 65;
invalidateNodeLocalTransform(instructionLabel);
addNodeChild(root, instructionLabel);

// Button labels sit on top of their button. They never opt into hit testing, so a click on the text
// passes straight through to the button beneath instead of being swallowed by the label.
for (const btn of buttons) {
  const label = createTextLabel();
  label.data.text = btn.label;
  label.data.textFormat = { size: 14, color: 0xffffff };
  label.x = btn.x + 12;
  label.y = btn.y + btn.h / 2 - 8;
  invalidateNodeLocalTransform(label);
  addNodeChild(root, label);
}

const masterLabel = createTextLabel();
masterLabel.data.text = 'Master Volume';
masterLabel.data.textFormat = { size: 13, color: 0xaaaaaa };
masterLabel.x = SLIDER_X;
masterLabel.y = SLIDER_Y - 24;
invalidateNodeLocalTransform(masterLabel);
addNodeChild(root, masterLabel);

const masterValueLabel = createTextLabel();
masterValueLabel.data.text = Math.round(masterGain * 100) + '%';
masterValueLabel.data.textFormat = { size: 13, color: 0xdddddd };
masterValueLabel.x = SLIDER_X + SLIDER_W + 12;
masterValueLabel.y = SLIDER_Y + 4;
invalidateNodeLocalTransform(masterValueLabel);
addNodeChild(root, masterValueLabel);

const sfxBusLabel = createTextLabel();
sfxBusLabel.data.text = 'SFX Bus Gain';
sfxBusLabel.data.textFormat = { size: 12, color: 0x8899bb };
sfxBusLabel.x = SLIDER_X;
sfxBusLabel.y = BUS_SLIDER_Y - 20;
invalidateNodeLocalTransform(sfxBusLabel);
addNodeChild(root, sfxBusLabel);

const musicBusLabel = createTextLabel();
musicBusLabel.data.text = 'Music Bus Gain';
musicBusLabel.data.textFormat = { size: 12, color: 0x88bb99 };
musicBusLabel.x = SLIDER_X + BUS_SLIDER_W + 80;
musicBusLabel.y = BUS_SLIDER_Y - 20;
invalidateNodeLocalTransform(musicBusLabel);
addNodeChild(root, musicBusLabel);

const sfxPanLabel = createTextLabel();
sfxPanLabel.data.text = 'SFX Bus Pan';
sfxPanLabel.data.textFormat = { size: 12, color: 0x8899bb };
sfxPanLabel.x = SLIDER_X;
sfxPanLabel.y = PAN_SLIDER_Y - 20;
invalidateNodeLocalTransform(sfxPanLabel);
addNodeChild(root, sfxPanLabel);

const musicPanLabel = createTextLabel();
musicPanLabel.data.text = 'Music Bus Pan';
musicPanLabel.data.textFormat = { size: 12, color: 0x88bb99 };
musicPanLabel.x = SLIDER_X + BUS_SLIDER_W + 80;
musicPanLabel.y = PAN_SLIDER_Y - 20;
invalidateNodeLocalTransform(musicPanLabel);
addNodeChild(root, musicPanLabel);

const statusLabel = createTextLabel();
statusLabel.data.text = 'Ready';
statusLabel.data.textFormat = { size: 13, color: 0x999999 };
statusLabel.x = 60;
statusLabel.y = 530;
invalidateNodeLocalTransform(statusLabel);
addNodeChild(root, statusLabel);

// Wire interaction signals for sound buttons.
for (const btn of buttons) {
  connectInteractionSignal(interactionManager, btn.shape, 'onPointerOver', () => {
    hoveredButtons.add(btn);
    drawButton(btn);
  });

  connectInteractionSignal(interactionManager, btn.shape, 'onPointerOut', () => {
    hoveredButtons.delete(btn);
    drawButton(btn);
  });

  connectInteractionSignal(interactionManager, btn.shape, 'onPointerDown', () => {
    playSfx(btn.resource, 0.8, btn.pan);
    updateStatus('Played: ' + btn.label);
  });
}

// Wire interaction signals for the master volume slider track.
connectInteractionSignal(interactionManager, sliderTrack, 'onPointerDown', (data) => {
  const localX = data.localX - SLIDER_X;
  masterGain = Math.max(0, Math.min(1, localX / SLIDER_W));
  if (mixer !== null) setAudioMixerMasterGain(mixer, masterGain);
  drawMasterSlider();
  updateMasterValueLabel();
  updateStatus('Master volume: ' + Math.round(masterGain * 100) + '%');
});

// Wire interaction for bus gain sliders.
connectInteractionSignal(interactionManager, sfxSliderTrack, 'onPointerDown', (data) => {
  const localX = data.localX - SLIDER_X;
  const gain = Math.max(0, Math.min(1, localX / BUS_SLIDER_W));
  setAudioBusGain(sfxBus, gain);
  drawBusSliders();
  updateStatus('SFX bus gain: ' + Math.round(gain * 100) + '%');
});

connectInteractionSignal(interactionManager, musicSliderTrack, 'onPointerDown', (data) => {
  const localX = data.localX - (SLIDER_X + BUS_SLIDER_W + 80);
  const gain = Math.max(0, Math.min(1, localX / BUS_SLIDER_W));
  setAudioBusGain(musicBus, gain);
  drawBusSliders();
  updateStatus('Music bus gain: ' + Math.round(gain * 100) + '%');
});

// Wire interaction for bus pan sliders.
connectInteractionSignal(interactionManager, sfxPanTrack, 'onPointerDown', (data) => {
  const localX = data.localX - SLIDER_X;
  const pan = Math.max(-1, Math.min(1, (localX / BUS_SLIDER_W) * 2 - 1));
  setAudioBusPan(sfxBus, pan);
  drawPanSliders();
  updateStatus('SFX bus pan: ' + pan.toFixed(2));
});

connectInteractionSignal(interactionManager, musicPanTrack, 'onPointerDown', (data) => {
  const localX = data.localX - (SLIDER_X + BUS_SLIDER_W + 80);
  const pan = Math.max(-1, Math.min(1, (localX / BUS_SLIDER_W) * 2 - 1));
  setAudioBusPan(musicBus, pan);
  drawPanSliders();
  updateStatus('Music bus pan: ' + pan.toFixed(2));
});

function updateStatus(text: string): void {
  if (statusLabel.data.text !== text) {
    statusLabel.data.text = text;
    invalidateNodeAppearance(statusLabel);
  }
}

function updateMasterValueLabel(): void {
  const text = Math.round(masterGain * 100) + '%';
  if (masterValueLabel.data.text !== text) {
    masterValueLabel.data.text = text;
    invalidateNodeAppearance(masterValueLabel);
  }
}

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
