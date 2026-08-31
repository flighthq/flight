import type { Shape, Snapshot } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  setTextLabelString,
} from '@flighthq/sdk';
import { captureSnapshot, equalsSnapshot, interpolateSnapshots, restoreSnapshot } from '@flighthq/sdk/game';

import { render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const ITEM_COUNT = 6;
const COLLECT_RADIUS = 30;
const SLOT_COUNT = 5;
const INTERPOLATION_DURATION = 1000;

// Game state is plain data -- snapshot functions operate on this, not on display objects.

interface ItemState {
  x: number;
  y: number;
  collected: boolean;
}

interface GameState {
  player: {
    x: number;
    y: number;
    rotation: number;
    score: number;
  };
  items: ItemState[];
  time: number;
}

function createInitialState(): GameState {
  const positions = [
    [170, 120],
    [280, 330],
    [390, 105],
    [505, 330],
    [620, 130],
    [400, 220],
  ] as const;
  const items: ItemState[] = [];
  for (let i = 0; i < ITEM_COUNT; i += 1) {
    items.push({
      x: positions[i][0],
      y: positions[i][1],
      collected: false,
    });
  }
  return {
    player: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 - 20, rotation: 0, score: 0 },
    items,
    time: 0,
  };
}

const gameState: GameState = createInitialState();

// Snapshot storage: a ring buffer of up to SLOT_COUNT saved snapshots.
const snapshots: (Snapshot<GameState> | null)[] = Array.from<null>({ length: SLOT_COUNT }).fill(null);
let nextSlot = 0;

// Interpolation state: when active, smoothly transitions from a saved snapshot to the current state.
let interpolating = false;
let interpStartTime = 0;
let interpSource: Snapshot<GameState> | null = null;
let interpTarget: Snapshot<GameState> | null = null;
// A mutable working copy that receives interpolated values each frame.
const interpState: GameState = createInitialState();

// Scene3D graph: display objects that visualize the game state.
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const playerShape = createShape();
addNodeChild(root, playerShape);

const itemShapes: Shape[] = [];
for (let i = 0; i < ITEM_COUNT; i += 1) {
  const shape = createShape();
  addNodeChild(root, shape);
  itemShapes.push(shape);
}

const uiOverlay = createShape();
addNodeChild(root, uiOverlay);

const scoreLabel = createTextLabel();
scoreLabel.data.text = 'Score: 0';
scoreLabel.data.textFormat = { font: 'monospace', size: 16, color: 0xffffffff };
scoreLabel.x = 20;
scoreLabel.y = 440;
invalidateNodeLocalTransform(scoreLabel);
addNodeChild(root, scoreLabel);

const helpLabel = createTextLabel();
helpLabel.data.text = '[S] Save  [R] Restore  [1-5] Load slot  [I] Interpolate to slot 1';
helpLabel.data.textFormat = { font: 'monospace', size: 13, color: 0x999999ff };
helpLabel.x = 20;
helpLabel.y = 468;
invalidateNodeLocalTransform(helpLabel);
addNodeChild(root, helpLabel);

const statusLabel = createTextLabel();
statusLabel.data.text = '';
statusLabel.data.textFormat = { font: 'monospace', size: 14, color: 0x44cc88ff };
statusLabel.x = 400;
statusLabel.y = 440;
invalidateNodeLocalTransform(statusLabel);
addNodeChild(root, statusLabel);

// Input handling.

function saveSnapshot(): void {
  const snap = captureSnapshot(gameState);
  snapshots[nextSlot] = snap;
  showStatus(`Saved to slot ${nextSlot + 1}`);
  nextSlot = (nextSlot + 1) % SLOT_COUNT;
}

function restoreSlot(slot: number): void {
  const snap = snapshots[slot];
  if (snap === null) {
    showStatus(`Slot ${slot + 1} is empty`);
    return;
  }
  restoreSnapshot(snap, gameState);
  interpolating = false;
  showStatus(`Restored slot ${slot + 1}`);
}

function startInterpolation(): void {
  const snap = snapshots[0];
  if (snap === null) {
    showStatus('Slot 1 is empty -- save first');
    return;
  }
  if (equalsSnapshot(captureSnapshot(gameState), snap)) {
    showStatus('Already at slot 1');
    return;
  }
  interpSource = captureSnapshot(gameState);
  interpTarget = snap;
  interpolating = true;
  interpStartTime = performance.now();
  showStatus('Interpolating to slot 1...');
}

let statusTimeout = 0;

function showStatus(message: string): void {
  setTextLabelString(statusLabel, message);
  clearTimeout(statusTimeout);
  statusTimeout = window.setTimeout(() => {
    setTextLabelString(statusLabel, '');
  }, 2000);
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  switch (event.key) {
    case 's':
    case 'S':
      saveSnapshot();
      break;
    case 'r':
    case 'R':
      restoreSlot((nextSlot - 1 + SLOT_COUNT) % SLOT_COUNT);
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
      restoreSlot(Number(event.key) - 1);
      break;
    case 'i':
    case 'I':
      startInterpolation();
      break;
  }
});

// Slot 1 captures the deterministic starting state, so restore and interpolation are immediately
// available and the smoke frame visibly proves that snapshot storage is active.
saveSnapshot();

// Drawing helpers: translate game state into shape commands each frame.

function drawPlayer(shape: Shape, x: number, y: number, rotation: number): void {
  clearShapeCommands(shape);

  const radians = (rotation * Math.PI) / 180;
  const size = 18;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Triangle pointing in the direction of `rotation`.
  const tipX = x + cos * size;
  const tipY = y + sin * size;
  const leftX = x + Math.cos(radians + 2.4) * size;
  const leftY = y + Math.sin(radians + 2.4) * size;
  const rightX = x + Math.cos(radians - 2.4) * size;
  const rightY = y + Math.sin(radians - 2.4) * size;

  appendShapeBeginFill(shape, 0x44aaffff);
  appendShapeMoveTo(shape, tipX, tipY);
  appendShapeLineTo(shape, leftX, leftY);
  appendShapeLineTo(shape, rightX, rightY);
  appendShapeLineTo(shape, tipX, tipY);
  appendShapeEndFill(shape);

  invalidateNodeAppearance(shape);
}

function drawItem(shape: Shape, item: Readonly<ItemState>): void {
  clearShapeCommands(shape);
  if (item.collected) {
    invalidateNodeAppearance(shape);
    return;
  }
  appendShapeBeginFill(shape, 0xffcc33ff);
  appendShapeCircle(shape, item.x, item.y, 10);
  appendShapeEndFill(shape);
  invalidateNodeAppearance(shape);
}

function drawSlotIndicators(shape: Shape): void {
  clearShapeCommands(shape);
  const startX = 650;
  const y = 450;
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const cx = startX + i * 24;
    if (snapshots[i] !== null) {
      appendShapeBeginFill(shape, 0x44cc88ff);
      appendShapeCircle(shape, cx, y, 8);
      appendShapeEndFill(shape);
    } else {
      appendShapeLineStyle(shape, 2, 0x555555ff);
      appendShapeCircle(shape, cx, y, 8);
    }
    // Slot number label drawn as a small tick mark above.
    appendShapeLineStyle(shape, 1, 0x777777ff);
    appendShapeMoveTo(shape, cx, y - 14);
    appendShapeLineTo(shape, cx, y - 18);
  }
  invalidateNodeAppearance(shape);
}

// Simulation: player orbits the center, items get collected on proximity.

function updateSimulation(dt: number): void {
  gameState.time += dt;

  // Player moves in a circular path.
  const orbitSpeed = 0.3;
  const orbitRadius = 120;
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2 - 40;
  const angle = gameState.time * orbitSpeed;

  gameState.player.x = centerX + Math.cos(angle) * orbitRadius;
  gameState.player.y = centerY + Math.sin(angle) * orbitRadius;
  gameState.player.rotation = (angle * 180) / Math.PI + 90;

  // Check item collection.
  for (const item of gameState.items) {
    if (item.collected) continue;
    const dx = gameState.player.x - item.x;
    const dy = gameState.player.y - item.y;
    if (dx * dx + dy * dy < COLLECT_RADIUS * COLLECT_RADIUS) {
      item.collected = true;
      gameState.player.score += 100;
    }
  }
}

// Render loop.

let lastTime = performance.now();
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

function enterFrame(): void {
  const now = performance.now();
  const dt = captureMode ? 1 / 60 : Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Determine which state to render: if interpolating, blend between saved snapshots.
  let renderState: Readonly<GameState> = gameState;

  if (!interpolating) {
    updateSimulation(dt);
  } else if (interpSource !== null && interpTarget !== null) {
    updateSimulation(dt);
    const elapsed = now - interpStartTime;
    const t = Math.min(elapsed / INTERPOLATION_DURATION, 1);
    interpolateSnapshots(interpSource, interpTarget, t, interpState);
    renderState = interpState;
    if (t >= 1) {
      restoreSnapshot(interpTarget, gameState);
      interpolating = false;
      showStatus('Interpolation complete');
    }
  }

  // Draw the current visual state.
  drawPlayer(playerShape, renderState.player.x, renderState.player.y, renderState.player.rotation);
  for (let i = 0; i < ITEM_COUNT; i += 1) {
    drawItem(itemShapes[i], renderState.items[i]);
  }
  drawSlotIndicators(uiOverlay);

  setTextLabelString(scoreLabel, `Score: ${renderState.player.score}`);

  render(root);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

enterFrame();
