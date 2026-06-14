import type { AudioSource, DisplayObject, ImageSource, InteractionManager, Text, TweenManager } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  connectSignal,
  createDisplayObject,
  createShape,
  createText,
  createTween,
  invalidateNodeRender,
  playAudioSource,
  Quad,
} from '@flighthq/sdk';

import type { Tile, TileInteractionOptions } from './tile';
import {
  connectTileInteraction,
  createTile,
  initTile,
  moveTile,
  removeTileAnimated,
  removeTileImmediate,
  TILE_STEP,
} from './tile';

const NUM_COLUMNS = 8;
const NUM_ROWS = 8;
const CONTENT_WIDTH = TILE_STEP * NUM_COLUMNS;
const CONTENT_HEIGHT = TILE_STEP * NUM_ROWS;
const BACKGROUND_Y = 85;
const TILE_CONTAINER_X = 14;
const TILE_CONTAINER_Y = BACKGROUND_Y + 14;

export class PiratePigGame {
  obj: DisplayObject;
  currentScale: number = 1;
  currentScore: number = 0;

  private interaction: InteractionManager;
  private interactionOptions: TileInteractionOptions | undefined;
  private tileContainer: DisplayObject;
  private scoreText: Text;
  private tiles: (Tile | null)[][];
  private usedTiles: Tile[] = [];
  private tileImages: ImageSource[];
  private sounds: AudioSource[];
  private manager: TweenManager;
  private needToCheckMatches: boolean = false;

  constructor(
    manager: TweenManager,
    interactionManager: InteractionManager,
    tileImages: ImageSource[],
    logoImage: ImageSource,
    fontName: string,
    sounds: AudioSource[],
    interactionOptions?: TileInteractionOptions,
  ) {
    this.manager = manager;
    this.interaction = interactionManager;
    this.interactionOptions = interactionOptions;
    this.tileImages = tileImages;
    this.sounds = sounds;
    this.obj = createDisplayObject();

    const scoreText = createText();
    scoreText.data.text = '0';
    scoreText.data.textFormat = { font: fontName, size: 60, color: 0x000000, align: 'right' };
    scoreText.x = CONTENT_WIDTH - 200;
    scoreText.y = 12;
    addNodeChild(this.obj, scoreText);
    this.scoreText = scoreText;

    const backgroundPanel = createShape();
    backgroundPanel.y = BACKGROUND_Y;
    appendShapeBeginFill(backgroundPanel, 0xffffff, 0.4);
    appendShapeRectangle(backgroundPanel, 0, 0, CONTENT_WIDTH, CONTENT_HEIGHT);
    appendShapeEndFill(backgroundPanel);
    addNodeChild(this.obj, backgroundPanel);

    const tileContainer = createDisplayObject();
    tileContainer.x = TILE_CONTAINER_X;
    tileContainer.y = TILE_CONTAINER_Y;
    addNodeChild(this.obj, tileContainer);
    this.tileContainer = tileContainer;

    this.tiles = Array.from({ length: NUM_ROWS }, () => new Array(NUM_COLUMNS).fill(null));

    void logoImage;
  }

  newGame(): void {
    this.currentScore = 0;
    this.updateScore();

    for (let row = 0; row < NUM_ROWS; row++) {
      for (let col = 0; col < NUM_COLUMNS; col++) {
        this.removeTileAt(row, col, false);
      }
    }
    for (let row = 0; row < NUM_ROWS; row++) {
      for (let col = 0; col < NUM_COLUMNS; col++) {
        this.addTile(row, col, false);
      }
    }

    playAudioSource(this.sounds[0]);
    this.needToCheckMatches = true;
  }

  onEnterFrame(): void {
    if (!this.needToCheckMatches) return;
    this.needToCheckMatches = false;

    const matched = this.findMatches(true).concat(this.findMatches(false));

    for (const tile of matched) {
      this.removeTileAt(tile.row, tile.column, true);
    }

    if (matched.length > 0) {
      this.updateScore();
      this.dropTiles();
    }
  }

  resize(stageWidth: number, stageHeight: number): void {
    this.obj.scaleX = 1;
    this.obj.scaleY = 1;

    const scale = Math.min((stageWidth * 0.9) / CONTENT_WIDTH, (stageHeight * 0.86) / CONTENT_HEIGHT);

    this.currentScale = scale;
    this.obj.scaleX = scale;
    this.obj.scaleY = scale;
    this.obj.x = stageWidth / 2 - (CONTENT_WIDTH * scale) / 2;

    invalidateNodeRender(this.obj);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private addTile(row: number, col: number, animate: boolean): void {
    const type = Math.round(Math.random() * (this.tileImages.length - 1));

    let tile = this.usedTiles.find((t) => t.removed && t.type === type) ?? null;
    if (tile === null) {
      tile = createTile(this.tileImages[type], type);
      this.usedTiles.push(tile);
      connectTileInteraction(
        tile,
        this.interaction,
        (t, dx, dy) => {
          let targetRow = t.row;
          let targetCol = t.column;
          if (Math.abs(dx) > Math.abs(dy)) {
            targetCol += dx < 0 ? -1 : 1;
          } else {
            targetRow += dy < 0 ? -1 : 1;
          }
          this.swapTile(t, targetRow, targetCol);
        },
        this.interactionOptions,
      );
    }

    initTile(tile);
    tile.type = type;
    tile.row = row;
    tile.column = col;
    this.tiles[row][col] = tile;

    if (animate) {
      tile.obj.alpha = 0;
      tile.obj.x = tileX(col);
      tile.obj.y = tileY(-1);

      moveTile(this.manager, tile, 150 * (row + 1), tileX(col), tileY(row));

      const alphaTween = createTween(
        this.manager,
        tile.obj,
        300,
        { alpha: 1 },
        {
          delay: Math.max(0, 150 * (row - 2)),
          ease: Quad.easeOut,
        },
      );
      connectSignal(alphaTween.onUpdate, () => invalidateNodeRender(tile.obj));
    } else {
      tile.obj.x = tileX(col);
      tile.obj.y = tileY(row);
    }

    addNodeChild(this.tileContainer, tile.obj);
    this.needToCheckMatches = true;
  }

  private dropTiles(): void {
    for (let col = 0; col < NUM_COLUMNS; col++) {
      let spaces = 0;

      for (let i = 0; i < NUM_ROWS; i++) {
        const row = NUM_ROWS - 1 - i;
        const tile = this.tiles[row][col];

        if (tile === null) {
          spaces++;
        } else if (spaces > 0) {
          const newRow = row + spaces;
          moveTile(this.manager, tile, 150 * spaces, tileX(col), tileY(newRow));
          tile.row = newRow;
          this.tiles[newRow][col] = tile;
          this.tiles[row][col] = null;
          this.needToCheckMatches = true;
        }
      }

      for (let i = 0; i < spaces; i++) {
        this.addTile(spaces - 1 - i, col, true);
      }
    }
  }

  private findMatches(byRow: boolean, accumulateScore = true): Tile[] {
    const matched: Tile[] = [];
    const outer = byRow ? NUM_ROWS : NUM_COLUMNS;
    const inner = byRow ? NUM_COLUMNS : NUM_ROWS;

    for (let o = 0; o < outer; o++) {
      const run: Tile[] = [];

      const flushRun = (): void => {
        if (run.length >= 3) {
          if (accumulateScore) {
            const n = run.length;
            if (n > 4) playAudioSource(this.sounds[3]);
            else if (n > 3) playAudioSource(this.sounds[2]);
            else playAudioSource(this.sounds[1]);
            this.currentScore += Math.round(Math.pow(n - 1, 2) * 50);
          }
          for (const t of run) matched.push(t);
        }
        run.length = 0;
      };

      for (let i = 0; i < inner; i++) {
        const tile = byRow ? this.tiles[o][i] : this.tiles[i][o];

        if (tile !== null && !tile.moving) {
          if (run.length > 0 && tile.type !== run[0].type) flushRun();
          run.push(tile);
        } else {
          if (tile?.moving) this.needToCheckMatches = true;
          flushRun();
        }
      }
      flushRun();
    }

    return matched;
  }

  private removeTileAt(row: number, col: number, animate: boolean): void {
    const tile = this.tiles[row][col];
    if (tile === null) return;
    this.tiles[row][col] = null;

    if (animate) {
      removeTileAnimated(this.manager, tile, this.tileContainer);
    } else {
      removeTileImmediate(tile, this.tileContainer);
    }
  }

  private swapTile(tile: Tile, targetRow: number, targetColumn: number): void {
    if (targetColumn < 0 || targetColumn >= NUM_COLUMNS || targetRow < 0 || targetRow >= NUM_ROWS) return;

    const targetTile = this.tiles[targetRow][targetColumn];
    if (targetTile === null || targetTile.moving) return;

    this.tiles[targetRow][targetColumn] = tile;
    this.tiles[tile.row][tile.column] = targetTile;

    if (this.findMatches(true, false).length > 0 || this.findMatches(false, false).length > 0) {
      const prevRow = tile.row;
      const prevCol = tile.column;
      targetTile.row = prevRow;
      targetTile.column = prevCol;
      tile.row = targetRow;
      tile.column = targetColumn;
      moveTile(this.manager, targetTile, 300, tileX(prevCol), tileY(prevRow));
      moveTile(this.manager, tile, 300, tileX(targetColumn), tileY(targetRow));
      this.needToCheckMatches = true;
    } else {
      this.tiles[targetRow][targetColumn] = targetTile;
      this.tiles[tile.row][tile.column] = tile;
    }
  }

  private updateScore(): void {
    this.scoreText.data.text = String(this.currentScore);
    invalidateNodeRender(this.scoreText);
  }
}

function tileX(col: number): number {
  return col * TILE_STEP;
}

function tileY(row: number): number {
  return row * TILE_STEP;
}
