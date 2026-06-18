import { createReferenceStage } from '../../_harness/stage';
// Requires: assets/unifont-8.0.01.ttf
// Unicode character grid browser with arrow key navigation.
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 1000;
const HEIGHT = 700;
const COLS = 16;
const ROWS = 16;
const CELL_SIZE = 36;
const FONT = 'Unifont';

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

(async () => {
  const ff = new FontFace(FONT, 'url(assets/unifont-8.0.01.ttf)');
  await ff.load();
  (document.fonts as any).add(ff);

  const charFmt = new TextFormat(FONT, 20, 0x000000);
  const infoFmt = new TextFormat('sans-serif', 14, 0x444444);
  const headerFmt = new TextFormat('sans-serif', 16, 0x000000, true);

  // Header
  const header = new TextField();
  header.defaultTextFormat = headerFmt;
  header.x = 10;
  header.y = 10;
  header.width = WIDTH - 20;
  header.height = 28;
  header.text = 'Unicode Browser — Arrow keys to navigate pages';
  root.addChild(header);

  // Info bar at bottom
  const info = new TextField();
  info.defaultTextFormat = infoFmt;
  info.x = 10;
  info.y = HEIGHT - 30;
  info.width = WIDTH - 20;
  info.height = 24;
  root.addChild(info);

  let page = 0; // 0 = U+0000–U+00FF, etc.

  function buildPage(): void {
    // Remove old cells (keep header=0, info=last)
    while (root.numChildren > 2) {
      root.removeChildAt(1);
    }

    const baseCP = page * COLS * ROWS;

    // Page label
    const pageLabel = new TextField();
    pageLabel.defaultTextFormat = infoFmt;
    pageLabel.x = WIDTH - 160;
    pageLabel.y = 10;
    pageLabel.width = 150;
    pageLabel.height = 24;
    pageLabel.text = `Page ${page} (U+${baseCP.toString(16).toUpperCase().padStart(4, '0')}–U+${(baseCP + COLS * ROWS - 1).toString(16).toUpperCase().padStart(4, '0')})`;
    root.addChild(pageLabel);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cp = baseCP + row * COLS + col;
        if (cp > 0x10ffff) break;

        const x = 20 + col * CELL_SIZE;
        const y = 50 + row * CELL_SIZE;

        // Skip surrogates
        let ch: string;
        if (cp >= 0xd800 && cp <= 0xdfff) {
          ch = ' ';
        } else {
          try {
            ch = String.fromCodePoint(cp);
          } catch {
            ch = ' ';
          }
        }

        const cell = new TextField();
        cell.defaultTextFormat = charFmt;
        cell.x = x;
        cell.y = y;
        cell.width = CELL_SIZE;
        cell.height = CELL_SIZE;
        cell.text = ch;
        root.addChild(cell);
      }
    }

    info.text = `Page ${page + 1} · U+${baseCP.toString(16).toUpperCase().padStart(4, '0')} – U+${(baseCP + COLS * ROWS - 1).toString(16).toUpperCase().padStart(4, '0')}`;
  }

  buildPage();

  document.addEventListener('keydown', (e) => {
    const maxPage = Math.ceil(0x110000 / (COLS * ROWS)) - 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      page = Math.min(page + 1, maxPage);
      buildPage();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      page = Math.max(page - 1, 0);
      buildPage();
      e.preventDefault();
    }
  });
})();
