import {
  DisplayObjectKind,
  HtmlViewKind,
  MovieClipKind,
  QuadBatchKind,
  RenderTargetNode2DKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types/contract';

import {
  defaultNode2DHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRenderTargetNode2DHitTestHandler,
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
  registerHitTest(DisplayObjectKind, defaultNode2DHitTestHandler);
  registerHitTest(HtmlViewKind, defaultHtmlViewHitTestHandler);
  registerHitTest(MovieClipKind, defaultMovieClipHitTestHandler);
  registerHitTest(QuadBatchKind, defaultQuadBatchHitTestHandler);
  registerHitTest(RenderTargetNode2DKind, defaultRenderTargetNode2DHitTestHandler);
  registerHitTest(RichTextKind, defaultRichTextHitTestHandler);
  registerHitTest(Scale9ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(ShapeKind, defaultShapeHitTestHandler);
  registerHitTest(SpriteKind, defaultSpriteHitTestHandler);
  registerHitTest(TextLabelKind, defaultTextHitTestHandler);
  registerHitTest(TilemapKind, defaultTilemapHitTestHandler);
  registerHitTest(VideoKind, defaultVideoHitTestHandler);
}
