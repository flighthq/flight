import { MovieClipKind } from '@flighthq/movieclip/contract';
import { DisplayObjectKind, HtmlViewKind, Scale9SpriteKind, SpriteKind } from '@flighthq/scene2d/contract';
import { MorphShapeKind, Scale9ShapeKind, ShapeKind } from '@flighthq/shape/contract';
import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import { TilemapKind } from '@flighthq/tilemap/contract';
import { QuadBatchKind } from '@flighthq/types/contract';

import {
  defaultNode2DHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRichTextHitTestHandler,
  defaultShapeHitTestHandler,
  defaultTextHitTestHandler,
} from './displayHitTests.ts';
import { registerHitTest } from './hitTests.ts';
import {
  defaultQuadBatchHitTestHandler,
  defaultSpriteHitTestHandler,
  defaultTilemapHitTestHandler,
} from './spriteHitTests.ts';

export function registerDefaultHitTests(): void {
  registerHitTest(DisplayObjectKind, defaultNode2DHitTestHandler);
  registerHitTest(HtmlViewKind, defaultHtmlViewHitTestHandler);
  registerHitTest(MovieClipKind, defaultMovieClipHitTestHandler);
  registerHitTest(MorphShapeKind, defaultShapeHitTestHandler);
  registerHitTest(QuadBatchKind, defaultQuadBatchHitTestHandler);
  registerHitTest(RichTextKind, defaultRichTextHitTestHandler);
  registerHitTest(Scale9ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(Scale9SpriteKind, defaultSpriteHitTestHandler);
  registerHitTest(ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(SpriteKind, defaultSpriteHitTestHandler);
  registerHitTest(TextLabelKind, defaultTextHitTestHandler);
  registerHitTest(TilemapKind, defaultTilemapHitTestHandler);
}
