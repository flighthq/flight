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
  StageKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import {
  defaultBitmapHitTestPointHandler,
  defaultDisplayObjectHitTestPointHandler,
  defaultHtmlViewHitTestPointHandler,
  defaultMovieClipHitTestPointHandler,
  defaultRenderViewHitTestPointHandler,
  defaultRichTextHitTestPointHandler,
  defaultShapeHitTestPointHandler,
  defaultStageHitTestPointHandler,
  defaultTextHitTestPointHandler,
  defaultVideoHitTestPointHandler,
} from './displayHitTests';
import { registerHitTestPoint } from './hitTests';
import {
  defaultQuadBatchHitTestPointHandler,
  defaultSpriteHitTestPointHandler,
  defaultTilemapHitTestPointHandler,
} from './spriteHitTests';

export function registerDefaultHitTestPoints(): void {
  registerHitTestPoint(BitmapKind, defaultBitmapHitTestPointHandler);
  registerHitTestPoint(DisplayObjectKind, defaultDisplayObjectHitTestPointHandler);
  registerHitTestPoint(HtmlViewKind, defaultHtmlViewHitTestPointHandler);
  registerHitTestPoint(MovieClipKind, defaultMovieClipHitTestPointHandler);
  registerHitTestPoint(QuadBatchKind, defaultQuadBatchHitTestPointHandler);
  registerHitTestPoint(RenderViewKind, defaultRenderViewHitTestPointHandler);
  registerHitTestPoint(RichTextKind, defaultRichTextHitTestPointHandler);
  registerHitTestPoint(Scale9ShapeKind, defaultShapeHitTestPointHandler);
  registerHitTestPoint(ShapeKind, defaultShapeHitTestPointHandler);
  registerHitTestPoint(SpriteKind, defaultSpriteHitTestPointHandler);
  registerHitTestPoint(StageKind, defaultStageHitTestPointHandler);
  registerHitTestPoint(TextLabelKind, defaultTextHitTestPointHandler);
  registerHitTestPoint(TilemapKind, defaultTilemapHitTestPointHandler);
  registerHitTestPoint(VideoKind, defaultVideoHitTestPointHandler);
}
