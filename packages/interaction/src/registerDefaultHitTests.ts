import {
  DisplayObjectKind,
  HtmlViewKind,
  MorphShapeKind,
  MovieClipKind,
  QuadBatchKind,
  RichTextKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import {
  defaultNode2DHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRichTextHitTestHandler,
  defaultShapeHitTestHandler,
  defaultTextHitTestHandler,
} from './displayHitTests';
import { registerHitTest } from './hitTests';
import {
  defaultQuadBatchHitTestHandler,
  defaultSpriteHitTestHandler,
  defaultTilemapHitTestHandler,
} from './spriteHitTests';

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
