import type { Node2D, FlowState } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  removeNodeChildren,
} from '@flighthq/sdk';
import {
  clearFlowStack,
  createFlowStack,
  getActiveFlowState,
  getFlowStackDepth,
  getFlowStackVisibleStates,
  popFlowState,
  pushFlowState,
  replaceFlowState,
  updateFlowStack,
} from '@flighthq/sdk/game';

import { render, scale } from './render';

const WIDTH = 600;
const HEIGHT = 400;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const stack = createFlowStack();
const visibleStates: FlowState[] = [];

let score = 0;
let bootTimer = 0;

function createBackground(color: number, alpha: number): Node2D {
  const bg = createShape();
  appendShapeBeginFill(bg, color, alpha);
  appendShapeRectangle(bg, 0, 0, WIDTH, HEIGHT);
  return bg;
}

function createLabel(text: string, x: number, y: number, size: number, color: number): Node2D {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { size, color };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  return label;
}

function updateLabel(label: Node2D, text: string): void {
  (label as ReturnType<typeof createTextLabel>).data.text = text;
  invalidateNodeAppearance(label);
}

// Each flow state owns a container of display objects. The container is created in onEnter and
// discarded in onExit. The render loop reads getFlowStackVisibleStates each frame and adds only the
// visible containers to the root -- the flow stack drives what is drawn.

const stateContainers = new Map<FlowState, Node2D>();

function createStateContainer(flowState: FlowState): Node2D {
  const container = createDisplayObject();
  stateContainers.set(flowState, container);
  return container;
}

function getStateContainer(flowState: FlowState): Node2D | null {
  return stateContainers.get(flowState) ?? null;
}

// State definitions. Each builds its visual layer in onEnter and drops it in onExit.

let playScoreLabel: Node2D;
let playTimerLabel: Node2D;

const bootState: FlowState = {
  name: 'Boot',
  onEnter() {
    bootTimer = 0;
    const container = createStateContainer(bootState);
    addNodeChild(container, createBackground(0x111111, 1));
    addNodeChild(container, createLabel('FLIGHT SDK', 200, 140, 32, 0xffffffff));
    addNodeChild(container, createLabel('Loading...', 240, 190, 18, 0x888888ff));
  },
  onExit() {
    stateContainers.delete(bootState);
  },
  onUpdate(deltaTime: number) {
    bootTimer += deltaTime;
    // After 1.5 seconds, replace Boot with Menu (Boot exits, Menu enters, stack depth stays 1).
    if (bootTimer >= 1500) {
      replaceFlowState(stack, menuState);
    }
  },
};

const menuState: FlowState = {
  name: 'Menu',
  onEnter() {
    const container = createStateContainer(menuState);
    addNodeChild(container, createBackground(0x1a3a5c, 1));
    addNodeChild(container, createLabel('FLOW STATES', 170, 80, 36, 0xffffffff));
    addNodeChild(container, createLabel('A @flighthq/flow demo', 190, 130, 16, 0xaaaaaaff));
    addNodeChild(container, createLabel('Press ENTER to play', 195, 220, 20, 0x44cc88ff));
    addNodeChild(container, createLabel('Press Q to clear stack', 195, 260, 16, 0x888888ff));
  },
  onExit() {
    stateContainers.delete(menuState);
  },
  onPause() {},
  onResume() {},
};

const playState: FlowState = {
  name: 'Play',
  onEnter() {
    score = 0;
    const container = createStateContainer(playState);
    addNodeChild(container, createBackground(0x2d5016, 1));
    addNodeChild(container, createLabel('PLAYING', 230, 30, 28, 0xffffffff));
    playScoreLabel = createLabel('Score: 0', 30, 100, 22, 0xeedd44ff);
    addNodeChild(container, playScoreLabel);
    playTimerLabel = createLabel('', 30, 140, 16, 0xccccccff);
    addNodeChild(container, playTimerLabel);
    addNodeChild(container, createLabel('SPACE - score points', 30, 220, 16, 0x88bb88ff));
    addNodeChild(container, createLabel('ESCAPE - pause', 30, 250, 16, 0x88bb88ff));
    addNodeChild(container, createLabel('G - game over', 30, 280, 16, 0x88bb88ff));
  },
  onExit() {
    stateContainers.delete(playState);
  },
  onPause() {},
  onResume() {},
  onUpdate() {
    const elapsed = (performance.now() / 1000) | 0;
    updateLabel(playTimerLabel, 'Time: ' + elapsed + 's');
  },
};

// Pause is a transparent overlay: renderBelow = true so the play screen is visible underneath,
// updateBelow is omitted (false) so the play state stops ticking while paused.
const pauseState: FlowState = {
  name: 'Pause',
  renderBelow: true,
  onEnter() {
    const container = createStateContainer(pauseState);
    addNodeChild(container, createBackground(0x000000, 0.6));
    addNodeChild(container, createLabel('PAUSED', 225, 150, 40, 0xffffffff));
    addNodeChild(container, createLabel('Press ESCAPE to resume', 185, 210, 18, 0xccccccff));
  },
  onExit() {
    stateContainers.delete(pauseState);
  },
};

const gameOverState: FlowState = {
  name: 'GameOver',
  onEnter() {
    const container = createStateContainer(gameOverState);
    addNodeChild(container, createBackground(0x5c1a1a, 1));
    addNodeChild(container, createLabel('GAME OVER', 185, 100, 36, 0xff4444ff));
    addNodeChild(container, createLabel('Final Score: ' + score, 200, 160, 24, 0xffffffff));
    addNodeChild(container, createLabel('Press R to restart', 205, 240, 18, 0xccccccff));
    addNodeChild(container, createLabel('Press M for menu', 215, 275, 18, 0x888888ff));
  },
  onExit() {
    stateContainers.delete(gameOverState);
  },
};

// HUD: a separate display container drawn on top every frame, not a flow state. It reads the stack
// each frame and shows depth, active state, and full stack contents as diagnostic text.
const hud = createDisplayObject();
const hudDepthLabel = createLabel('', 400, 10, 14, 0xffff88ff);
const hudActiveLabel = createLabel('', 400, 30, 14, 0xffff88ff);
const hudStackLabel = createLabel('', 400, 50, 14, 0xffff88ff);
addNodeChild(hud, hudDepthLabel);
addNodeChild(hud, hudActiveLabel);
addNodeChild(hud, hudStackLabel);

function updateHud(): void {
  const depth = getFlowStackDepth(stack);
  const active = getActiveFlowState(stack);
  updateLabel(hudDepthLabel, 'Depth: ' + depth);
  updateLabel(hudActiveLabel, 'Active: ' + (active?.name ?? 'none'));
  const names = stack.states.map((s) => s.name ?? '?').join(' > ');
  updateLabel(hudStackLabel, 'Stack: ' + names);
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const active = getActiveFlowState(stack);
  const activeName = active?.name;

  if (e.key === 'Enter' && activeName === 'Menu') {
    // Push: Menu is paused, Play enters. Stack: Menu > Play.
    pushFlowState(stack, playState);
    return;
  }

  if (e.key === ' ' && activeName === 'Play') {
    score += 10;
    updateLabel(playScoreLabel, 'Score: ' + score);
    return;
  }

  if (e.key === 'Escape' && activeName === 'Play') {
    // Push: Play is paused, Pause enters. Stack: Menu > Play > Pause.
    pushFlowState(stack, pauseState);
    return;
  }

  if (e.key === 'Escape' && activeName === 'Pause') {
    // Pop: Pause exits, Play resumes. Stack: Menu > Play.
    popFlowState(stack);
    return;
  }

  if ((e.key === 'g' || e.key === 'G') && activeName === 'Play') {
    // Replace: Play exits, GameOver enters. Stack depth stays the same: Menu > GameOver.
    replaceFlowState(stack, gameOverState);
    return;
  }

  if ((e.key === 'r' || e.key === 'R') && activeName === 'GameOver') {
    // Replace: GameOver exits, Play enters fresh. Stack: Menu > Play.
    replaceFlowState(stack, playState);
    return;
  }

  if ((e.key === 'm' || e.key === 'M') && activeName === 'GameOver') {
    // Clear + push: exits all states top-to-bottom, then pushes Menu fresh. Stack: Menu.
    clearFlowStack(stack);
    pushFlowState(stack, menuState);
    return;
  }

  if ((e.key === 'q' || e.key === 'Q') && activeName === 'Menu') {
    // Clear + push: demonstrates clearFlowStack tearing down and rebuilding. Stack: Menu.
    clearFlowStack(stack);
    pushFlowState(stack, menuState);
    return;
  }
});

// Interactive runs start at Boot. Capture runs build the representative paused stack directly so
// smoke frames prove pause/resume layering (`renderBelow`) instead of only photographing a timer.
const captureWindow = window as typeof window & { __flightCapture?: boolean };
if (captureWindow.__flightCapture) {
  pushFlowState(stack, menuState);
  pushFlowState(stack, playState);
  pushFlowState(stack, pauseState);
} else {
  pushFlowState(stack, bootState);
}

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const deltaTime = now - lastTime;
  lastTime = now;

  updateFlowStack(stack, deltaTime);
  updateHud();

  // Rebuild root's children each frame from the visible-state list. Only states reachable through
  // the renderBelow chain are drawn; the flow stack decides what is on screen.
  getFlowStackVisibleStates(stack, visibleStates);
  removeNodeChildren(root);

  for (let i = 0; i < visibleStates.length; i++) {
    const container = getStateContainer(visibleStates[i]);
    if (container) {
      addNodeChild(root, container);
    }
  }

  // HUD is always on top, outside the flow stack.
  addNodeChild(root, hud);

  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
