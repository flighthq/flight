import type { CollisionAabb, CollisionManifold, FlowState, Node2D, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  attachKeyboardInput,
  connectSignal,
  connectInputStateToInputManager,
  createCamera2D,
  createCollisionManifold,
  createDisplayObject,
  createFlowStack,
  createImageResource,
  createInputManager,
  createInputState,
  createMatrix,
  createShape,
  createSprite,
  createTextLabel,
  createTexture,
  createTween,
  createTweenManager,
  endInputStateFrame,
  getActiveFlowState,
  getCamera2DViewMatrix,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  KeyCode,
  pushFlowState,
  replaceFlowState,
  testAabbAabbCollision,
  updateCamera2DFollow,
  updateTweens,
} from '@flighthq/sdk';

import { render, scale } from './render';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const GRAVITY = 980;
const JUMP_VELOCITY = -420;
const MOVE_SPEED = 220;
const PLAYER_WIDTH = 24;
const PLAYER_HEIGHT = 32;

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  shape: Shape;
}

const platformDefs: readonly { x: number; y: number; w: number; h: number; color: number }[] = [
  { x: -200, y: 400, w: 1600, h: 40, color: 0x4a7c59 },
  { x: 100, y: 320, w: 150, h: 16, color: 0x8b6914 },
  { x: 350, y: 260, w: 120, h: 16, color: 0x8b6914 },
  { x: 550, y: 200, w: 180, h: 16, color: 0x8b6914 },
  { x: 780, y: 300, w: 140, h: 16, color: 0x8b6914 },
  { x: 980, y: 220, w: 160, h: 16, color: 0x8b6914 },
  { x: 50, y: 160, w: 100, h: 16, color: 0x8b6914 },
];

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

const worldContainer = createDisplayObject();
addNodeChild(root, worldContainer);

const uiContainer = createDisplayObject();
addNodeChild(root, uiContainer);

const camera = createCamera2D(CANVAS_WIDTH, CANVAS_HEIGHT);
const viewMatrix = createMatrix();

let playerX = 200;
let playerY = 350;
let velocityX = 0;
let velocityY = 0;
let onGround = false;

const inputManager = createInputManager();
const inputState = createInputState();
attachKeyboardInput(inputManager, document);
connectInputStateToInputManager(inputState, inputManager);

const playerImage = document.createElement('canvas');
playerImage.width = PLAYER_WIDTH;
playerImage.height = PLAYER_HEIGHT;
const playerContext = playerImage.getContext('2d')!;
playerContext.fillStyle = '#dd3333';
playerContext.fillRect(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
playerContext.fillStyle = '#ffd7b5';
playerContext.fillRect(5, 4, PLAYER_WIDTH - 10, 9);
const playerSprite = createSprite();
playerSprite.data.texture = createTexture({
  dimension: '2d',
  source: createImageResource(playerImage),
});
addNodeChild(worldContainer, playerSprite);

const platforms: Platform[] = [];
for (const def of platformDefs) {
  const shape = createShape();
  appendShapeBeginFill(shape, def.color);
  appendShapeRectangle(shape, def.x, def.y, def.w, def.h);
  appendShapeEndFill(shape);
  invalidateNodeAppearance(shape);
  addNodeChild(worldContainer, shape);
  platforms.push({ x: def.x, y: def.y, width: def.w, height: def.h, color: def.color, shape });
}

const titleLabel = createTextLabel();
titleLabel.data.text = 'PLATFORMER';
titleLabel.data.textFormat = { color: 0xffffffff, size: 48, font: 'Arial', bold: true, align: 'center' };
titleLabel.data.width = CANVAS_WIDTH;
titleLabel.data.height = 100;
titleLabel.y = 150;
invalidateNodeAppearance(titleLabel);
invalidateNodeLocalTransform(titleLabel);
addNodeChild(uiContainer, titleLabel);

const subtitleLabel = createTextLabel();
subtitleLabel.data.text = 'Click to Play';
subtitleLabel.data.textFormat = { color: 0xddddddff, size: 24, font: 'Arial', align: 'center' };
subtitleLabel.data.width = CANVAS_WIDTH;
subtitleLabel.data.height = 60;
subtitleLabel.y = 260;
invalidateNodeAppearance(subtitleLabel);
invalidateNodeLocalTransform(subtitleLabel);
addNodeChild(uiContainer, subtitleLabel);

const gameOverLabel = createTextLabel();
gameOverLabel.data.text = 'Game Over - Click to Restart';
gameOverLabel.data.textFormat = { color: 0xff4444ff, size: 32, font: 'Arial', bold: true, align: 'center' };
gameOverLabel.data.width = CANVAS_WIDTH;
gameOverLabel.data.height = 80;
gameOverLabel.y = 200;
gameOverLabel.visible = false;
invalidateNodeAppearance(gameOverLabel);
invalidateNodeLocalTransform(gameOverLabel);
addNodeChild(uiContainer, gameOverLabel);

const flow = createFlowStack();
const tweenManager = createTweenManager();

function setVisible(node: Node2D, visible: boolean): void {
  node.visible = visible;
  invalidateNodeAppearance(node);
}

function showWithFade(node: Node2D, duration: number): void {
  node.visible = true;
  node.alpha = 0;
  invalidateNodeAppearance(node);
  const tween = createTween(tweenManager, node, duration, { alpha: 1 });
  connectSignal(tween.onUpdate, () => invalidateNodeAppearance(node));
}

const titleState: FlowState = {
  name: 'title',
  onEnter(): void {
    showWithFade(titleLabel, 500);
    setVisible(subtitleLabel, true);
    setVisible(gameOverLabel, false);
    setVisible(worldContainer, false);
  },
};

const playingState: FlowState = {
  name: 'playing',
  onEnter(): void {
    resetPlayer();
    setVisible(titleLabel, false);
    setVisible(subtitleLabel, false);
    setVisible(gameOverLabel, false);
    setVisible(worldContainer, true);
  },
};

const gameOverState: FlowState = {
  name: 'gameover',
  onEnter(): void {
    showWithFade(gameOverLabel, 350);
  },
};

document.addEventListener('click', () => {
  const active = getActiveFlowState(flow);
  if (active === titleState || active === gameOverState) replaceFlowState(flow, playingState);
});

function resetPlayer(): void {
  playerX = 200;
  playerY = 350;
  velocityX = 0;
  velocityY = 0;
  onGround = false;
}

function triggerGameOver(): void {
  replaceFlowState(flow, gameOverState);
}

const manifold: CollisionManifold = createCollisionManifold();

const playerAabb: CollisionAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const platformAabb: CollisionAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function updateGame(dt: number): void {
  velocityX = 0;

  if (inputState.keysDown.has(KeyCode.LEFT) || inputState.keysDown.has(KeyCode.A)) {
    velocityX = -MOVE_SPEED;
  }
  if (inputState.keysDown.has(KeyCode.RIGHT) || inputState.keysDown.has(KeyCode.D)) {
    velocityX = MOVE_SPEED;
  }
  if (
    (inputState.keysDown.has(KeyCode.UP) ||
      inputState.keysDown.has(KeyCode.W) ||
      inputState.keysDown.has(KeyCode.SPACE)) &&
    onGround
  ) {
    velocityY = JUMP_VELOCITY;
    onGround = false;
  }

  velocityY += GRAVITY * dt;

  playerX += velocityX * dt;
  playerY += velocityY * dt;

  onGround = false;

  playerAabb.minX = playerX;
  playerAabb.minY = playerY;
  playerAabb.maxX = playerX + PLAYER_WIDTH;
  playerAabb.maxY = playerY + PLAYER_HEIGHT;

  for (const plat of platforms) {
    platformAabb.minX = plat.x;
    platformAabb.minY = plat.y;
    platformAabb.maxX = plat.x + plat.width;
    platformAabb.maxY = plat.y + plat.height;

    if (testAabbAabbCollision(playerAabb, platformAabb, manifold)) {
      playerX += manifold.normalX * manifold.depth;
      playerY += manifold.normalY * manifold.depth;

      if (manifold.normalY < -0.5) {
        velocityY = 0;
        onGround = true;
      } else if (manifold.normalY > 0.5) {
        velocityY = 0;
      }

      playerAabb.minX = playerX;
      playerAabb.minY = playerY;
      playerAabb.maxX = playerX + PLAYER_WIDTH;
      playerAabb.maxY = playerY + PLAYER_HEIGHT;
    }
  }

  if (playerY > 600) {
    triggerGameOver();
  }

  updateCamera2DFollow(camera, playerX + PLAYER_WIDTH / 2, playerY + PLAYER_HEIGHT / 2, dt, {
    smoothTime: 0.15,
  });

  getCamera2DViewMatrix(camera, viewMatrix);

  worldContainer.x = viewMatrix.tx;
  worldContainer.y = viewMatrix.ty;
  worldContainer.scaleX = viewMatrix.a;
  worldContainer.scaleY = viewMatrix.d;
  invalidateNodeLocalTransform(worldContainer);

  playerSprite.x = playerX;
  playerSprite.y = playerY;
  invalidateNodeLocalTransform(playerSprite);
}

let lastTime = 0;
pushFlowState(flow, captureMode ? playingState : titleState);

function enterFrame(time: number): void {
  const dt = lastTime === 0 ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  updateTweens(tweenManager, dt * 1000);
  if (getActiveFlowState(flow) === playingState) {
    updateGame(dt);
  }

  render(root as Node2D);
  endInputStateFrame(inputState);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
