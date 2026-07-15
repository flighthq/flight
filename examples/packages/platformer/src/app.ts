import type { CollisionAabb, CollisionManifold, DisplayObject, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  clearShapeCommands,
  createCamera2D,
  createCollisionManifold,
  createDisplayObject,
  createMatrix,
  createShape,
  createTextLabel,
  getCamera2DViewMatrix,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  testAabbAabbCollision,
  updateCamera2DFollow,
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

const keys: Record<string, boolean> = {};

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
});

document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

const playerShape = createShape();
addNodeChild(worldContainer, playerShape);

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
titleLabel.data.textFormat = { color: 0xffffff, size: 48, font: 'Arial', bold: true, align: 'center' };
titleLabel.data.width = CANVAS_WIDTH;
titleLabel.data.height = 100;
titleLabel.y = 150;
invalidateNodeAppearance(titleLabel);
invalidateNodeLocalTransform(titleLabel);
addNodeChild(uiContainer, titleLabel);

const subtitleLabel = createTextLabel();
subtitleLabel.data.text = 'Click to Play';
subtitleLabel.data.textFormat = { color: 0xdddddd, size: 24, font: 'Arial', align: 'center' };
subtitleLabel.data.width = CANVAS_WIDTH;
subtitleLabel.data.height = 60;
subtitleLabel.y = 260;
invalidateNodeAppearance(subtitleLabel);
invalidateNodeLocalTransform(subtitleLabel);
addNodeChild(uiContainer, subtitleLabel);

const gameOverLabel = createTextLabel();
gameOverLabel.data.text = 'Game Over - Click to Restart';
gameOverLabel.data.textFormat = { color: 0xff4444, size: 32, font: 'Arial', bold: true, align: 'center' };
gameOverLabel.data.width = CANVAS_WIDTH;
gameOverLabel.data.height = 80;
gameOverLabel.y = 200;
gameOverLabel.visible = false;
invalidateNodeAppearance(gameOverLabel);
invalidateNodeLocalTransform(gameOverLabel);
addNodeChild(uiContainer, gameOverLabel);

type GameState = 'title' | 'playing' | 'gameover';
let gameState: GameState = 'title';

document.addEventListener('click', () => {
  if (gameState === 'title') {
    startGame();
  } else if (gameState === 'gameover') {
    startGame();
  }
});

function startGame(): void {
  gameState = 'playing';
  playerX = 200;
  playerY = 350;
  velocityX = 0;
  velocityY = 0;
  onGround = false;

  titleLabel.visible = false;
  invalidateNodeAppearance(titleLabel);
  subtitleLabel.visible = false;
  invalidateNodeAppearance(subtitleLabel);
  gameOverLabel.visible = false;
  invalidateNodeAppearance(gameOverLabel);

  worldContainer.visible = true;
  invalidateNodeAppearance(worldContainer);
}

function triggerGameOver(): void {
  gameState = 'gameover';
  gameOverLabel.visible = true;
  invalidateNodeAppearance(gameOverLabel);
}

const manifold: CollisionManifold = createCollisionManifold();

const playerAabb: CollisionAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const platformAabb: CollisionAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function updateGame(dt: number): void {
  velocityX = 0;

  if (keys['ArrowLeft'] || keys['KeyA']) {
    velocityX = -MOVE_SPEED;
  }
  if (keys['ArrowRight'] || keys['KeyD']) {
    velocityX = MOVE_SPEED;
  }
  if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && onGround) {
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

  drawPlayer();
}

function drawPlayer(): void {
  clearShapeCommands(playerShape);
  appendShapeBeginFill(playerShape, 0xdd3333);
  appendShapeRectangle(playerShape, playerX, playerY, PLAYER_WIDTH, PLAYER_HEIGHT);
  appendShapeEndFill(playerShape);
  invalidateNodeAppearance(playerShape);
}

let lastTime = 0;

function enterFrame(time: number): void {
  const dt = lastTime === 0 ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (gameState === 'playing') {
    updateGame(dt);
  }

  render(root as DisplayObject);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
