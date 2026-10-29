import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import {
  DisplayObjectKind,
  HtmlViewKind,
  MorphShapeKind,
  MovieClipKind,
  QuadBatchKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShapeKind,
  SpriteKind,
  TilemapKind,
} from '@flighthq/types/contract';

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
