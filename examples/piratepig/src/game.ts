import {
  addChild,
  beginFill,
  connectSignal,
  createDisplayObject,
  createShape,
  createText,
  createTween,
  type DisplayObject,
  drawRect,
  endFill,
  type ImageSource,
  invalidateRender,
  Quad,
  ShapeKind,
  type Text,
  type TweenManager,
} from '@flighthq/engine';

import { createTile, initTile, moveTile, removeTileAnimated, removeTileImmediate, type Tile, TILE_STEP } from './tile';

const NUM_COLUMNS = 8;
const NUM_ROWS = 8;
const CONTENT_WIDTH = TILE_STEP * NUM_COLUMNS;
const CONTENT_HEIGHT = TILE_STEP * NUM_ROWS;
const BACKGROUND_Y = 85;
const TILE_CONTAINER_X = 14;
const TILE_CONTAINER_Y = BACKGROUND_Y + 14;

export interface PiratePigGame {
  obj: DisplayObject;
  currentScale: number;
  currentScore: number;
}

interface GameState {
  game: PiratePigGame;
  tileContainer: DisplayObject;
  scoreText: Text;
  tiles: (Tile | null)[][];
  usedTiles: Tile[];
  tileImages: ImageSource[];
  sounds: (HTMLAudioElement | null)[];
  manager: TweenManager;
  needToCheckMatches: boolean;
}

let _state: GameState | null = null;

export function createPiratePigGame(
  manager: TweenManager,
  tileImages: ImageSource[],
  logoImage: ImageSource,
  fontName: string,
  sounds: (HTMLAudioElement | null)[],
): PiratePigGame {
  const obj = createDisplayObject();

  // Logo
  // (imported from app to avoid circular dep — caller adds logo child before calling this)

  // Score text
  const scoreText = createText();
  scoreText.data.text = '0';
  scoreText.data.textFormat = { font: fontName, size: 60, color: 0x000000, align: 'right' };
  scoreText.x = CONTENT_WIDTH - 200;
  scoreText.y = 12;
  addChild(obj, scoreText);

  // Background panel (BlurFilter not yet supported)
  const backgroundPanel = createShape();
  backgroundPanel.y = BACKGROUND_Y;
  beginFill(backgroundPanel, 0xffffff, 0.4);
  drawRect(backgroundPanel, 0, 0, CONTENT_WIDTH, CONTENT_HEIGHT);
  endFill(backgroundPanel);
  addChild(obj, backgroundPanel);

  // Tile container
  const tileContainer = createDisplayObject();
  tileContainer.x = TILE_CONTAINER_X;
  tileContainer.y = TILE_CONTAINER_Y;
  addChild(obj, tileContainer);

  const tiles: (Tile | null)[][] = [];
  for (let row = 0; row < NUM_ROWS; row++) {
    tiles[row] = new Array(NUM_COLUMNS).fill(null);
  }

  const game: PiratePigGame = { obj, currentScale: 1, currentScore: 0 };

  _state = {
    game,
    tileContainer,
    scoreText,
    tiles,
    usedTiles: [],
    tileImages,
    sounds,
    manager,
    needToCheckMatches: false,
  };

  void logoImage; // logo is added by the caller as the first child of obj

  return game;
}

export function newGame(): void {
  const s = _state!;
  s.game.currentScore = 0;
  updateScore(s);

  for (let row = 0; row < NUM_ROWS; row++) {
    for (let col = 0; col < NUM_COLUMNS; col++) {
      removeTileAt(s, row, col, false);
    }
  }
  for (let row = 0; row < NUM_ROWS; row++) {
    for (let col = 0; col < NUM_COLUMNS; col++) {
      addTile(s, row, col, false);
    }
  }

  playSound(s.sounds[0]);
  s.needToCheckMatches = true;
}

export function onEnterFrame(): void {
  const s = _state!;
  if (!s.needToCheckMatches) return;

  s.needToCheckMatches = false;

  const matched = findMatches(s, true).concat(findMatches(s, false));

  for (const tile of matched) {
    removeTileAt(s, tile.row, tile.column, true);
  }

  if (matched.length > 0) {
    updateScore(s);
    dropTiles(s);
  }
}

export function resizeGame(game: PiratePigGame, stageWidth: number, stageHeight: number): void {
  game.obj.scaleX = 1;
  game.obj.scaleY = 1;

  const scale = Math.min((stageWidth * 0.9) / CONTENT_WIDTH, (stageHeight * 0.86) / CONTENT_HEIGHT);

  game.currentScale = scale;
  game.obj.scaleX = scale;
  game.obj.scaleY = scale;
  game.obj.x = stageWidth / 2 - (CONTENT_WIDTH * scale) / 2;

  invalidateRender(game.obj);
}

export function hitTileAtStageXY(stageX: number, stageY: number): Tile | null {
  const s = _state;
  if (s === null) return null;

  const g = s.game;
  const localX = (stageX - g.obj.x) / g.obj.scaleX - s.tileContainer.x;
  const localY = (stageY - g.obj.y) / g.obj.scaleY - s.tileContainer.y;

  const col = Math.floor(localX / TILE_STEP);
  const row = Math.floor(localY / TILE_STEP);

  if (row >= 0 && row < NUM_ROWS && col >= 0 && col < NUM_COLUMNS) {
    return s.tiles[row][col] ?? null;
  }
  return null;
}

export function swapTile(tile: Tile, targetRow: number, targetColumn: number): void {
  const s = _state!;
  if (targetColumn < 0 || targetColumn >= NUM_COLUMNS || targetRow < 0 || targetRow >= NUM_ROWS) return;

  const targetTile = s.tiles[targetRow][targetColumn];
  if (targetTile === null || targetTile.moving) return;

  s.tiles[targetRow][targetColumn] = tile;
  s.tiles[tile.row][tile.column] = targetTile;

  if (findMatches(s, true, false).length > 0 || findMatches(s, false, false).length > 0) {
    const prevRow = tile.row;
    const prevCol = tile.column;
    targetTile.row = prevRow;
    targetTile.column = prevCol;
    tile.row = targetRow;
    tile.column = targetColumn;
    moveTile(s.manager, targetTile, 300, tileX(prevCol), tileY(prevRow));
    moveTile(s.manager, tile, 300, tileX(targetColumn), tileY(targetRow));
    s.needToCheckMatches = true;
  } else {
    s.tiles[targetRow][targetColumn] = targetTile;
    s.tiles[tile.row][tile.column] = tile;
  }
}

export { ShapeKind };

// ── Internal ───────────────────────────────────────────────────────────────

function addTile(s: GameState, row: number, col: number, animate: boolean): void {
  const type = Math.round(Math.random() * (s.tileImages.length - 1));

  let tile = s.usedTiles.find((t) => t.removed && t.type === type) ?? null;
  if (tile === null) {
    tile = createTile(s.tileImages[type], type);
    s.usedTiles.push(tile);
  }

  initTile(tile);
  tile.type = type;
  tile.row = row;
  tile.column = col;
  s.tiles[row][col] = tile;

  if (animate) {
    tile.obj.alpha = 0;
    tile.obj.x = tileX(col);
    tile.obj.y = tileY(-1);

    moveTile(s.manager, tile, 150 * (row + 1), tileX(col), tileY(row));

    const alphaTween = createTween(
      s.manager,
      tile.obj,
      300,
      { alpha: 1 },
      {
        delay: Math.max(0, 150 * (row - 2)),
        ease: Quad.easeOut,
      },
    );
    connectSignal(alphaTween.onUpdate, () => invalidateRender(tile.obj));
  } else {
    tile.obj.x = tileX(col);
    tile.obj.y = tileY(row);
  }

  addChild(s.tileContainer, tile.obj);
  s.needToCheckMatches = true;
}

function removeTileAt(s: GameState, row: number, col: number, animate: boolean): void {
  const tile = s.tiles[row][col];
  if (tile === null) return;
  s.tiles[row][col] = null;

  if (animate) {
    removeTileAnimated(s.manager, tile, s.tileContainer);
  } else {
    removeTileImmediate(tile, s.tileContainer);
  }
}

function dropTiles(s: GameState): void {
  for (let col = 0; col < NUM_COLUMNS; col++) {
    let spaces = 0;

    for (let i = 0; i < NUM_ROWS; i++) {
      const row = NUM_ROWS - 1 - i;
      const tile = s.tiles[row][col];

      if (tile === null) {
        spaces++;
      } else if (spaces > 0) {
        const newRow = row + spaces;
        moveTile(s.manager, tile, 150 * spaces, tileX(col), tileY(newRow));
        tile.row = newRow;
        s.tiles[newRow][col] = tile;
        s.tiles[row][col] = null;
        s.needToCheckMatches = true;
      }
    }

    for (let i = 0; i < spaces; i++) {
      addTile(s, spaces - 1 - i, col, true);
    }
  }
}

function findMatches(s: GameState, byRow: boolean, accumulateScore = true): Tile[] {
  const matched: Tile[] = [];
  const outer = byRow ? NUM_ROWS : NUM_COLUMNS;
  const inner = byRow ? NUM_COLUMNS : NUM_ROWS;

  for (let o = 0; o < outer; o++) {
    const run: Tile[] = [];

    const flushRun = (): void => {
      if (run.length >= 3) {
        if (accumulateScore) {
          const n = run.length;
          if (n > 4) playSound(s.sounds[3]);
          else if (n > 3) playSound(s.sounds[2]);
          else playSound(s.sounds[1]);
          s.game.currentScore += Math.round(Math.pow(n - 1, 2) * 50);
        }
        for (const t of run) matched.push(t);
      }
      run.length = 0;
    };

    for (let i = 0; i < inner; i++) {
      const tile = byRow ? s.tiles[o][i] : s.tiles[i][o];

      if (tile !== null && !tile.moving) {
        if (run.length > 0 && tile.type !== run[0].type) flushRun();
        run.push(tile);
      } else {
        if (tile?.moving) s.needToCheckMatches = true;
        flushRun();
      }
    }
    flushRun();
  }

  return matched;
}

function updateScore(s: GameState): void {
  s.scoreText.data.text = String(s.game.currentScore);
  invalidateRender(s.scoreText);
}

function tileX(col: number): number {
  return col * TILE_STEP;
}

function tileY(row: number): number {
  return row * TILE_STEP;
}

function playSound(audio: HTMLAudioElement | null): void {
  if (audio === null) return;
  (audio.cloneNode(true) as HTMLAudioElement).play().catch(() => {});
}
