import {
  BitmapKind,
  DisplayObjectKind,
  HtmlViewKind,
  MovieClipKind,
  QuadBatchKind,
  RenderViewKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import {
  defaultBitmapHitTestHandler,
  defaultDisplayObjectHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRenderViewHitTestHandler,
  defaultRichTextHitTestHandler,
  defaultShapeHitTestHandler,
  defaultTextHitTestHandler,
  defaultVideoHitTestHandler,
} from './displayHitTests';
import { registerHitTest } from './hitTests';
import {
  defaultQuadBatchHitTestHandler,
  defaultSpriteHitTestHandler,
  defaultTilemapHitTestHandler,
} from './spriteHitTests';

export function registerDefaultHitTests(): void {
  registerHitTest(BitmapKind, defaultBitmapHitTestHandler);
  registerHitTest(DisplayObjectKind, defaultDisplayObjectHitTestHandler);
  registerHitTest(HtmlViewKind, defaultHtmlViewHitTestHandler);
  registerHitTest(MovieClipKind, defaultMovieClipHitTestHandler);
  registerHitTest(QuadBatchKind, defaultQuadBatchHitTestHandler);
  registerHitTest(RenderViewKind, defaultRenderViewHitTestHandler);
  registerHitTest(RichTextKind, defaultRichTextHitTestHandler);
  registerHitTest(Scale9ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(SpriteKind, defaultSpriteHitTestHandler);
  registerHitTest(TextLabelKind, defaultTextHitTestHandler);
  registerHitTest(TilemapKind, defaultTilemapHitTestHandler);
  registerHitTest(VideoKind, defaultVideoHitTestHandler);
}
