export type { WebGLRenderStateInternal } from './internal';
export * from './webglBackground';
export * from './webglBitmap';
export * from './webglClip';
export * from './webglClipRectangle';
export * from './webglDisplayObject';
export * from './webglDraw';
export * from './webglElement';
export * from './webglInputText';
export * from './webglMask';
export * from './webglMaterials';
export * from './webglParticleEmitter';
export * from './webglQuadBatch';
export * from './webglRenderCache';
export * from './webglRenderState';
export * from './webglRenderTarget';
export * from './webglRichText';
export * from './webglShader';
export * from './webglShaderBinding';
export * from './webglShape';
export * from './webglSprite';
export * from './webglSpriteRenderer';
export * from './webglText';
export * from './webglTilemap';
export * from './webglVideo';
export type { WebGLRenderTarget } from '@flighthq/types';

// Re-export shape commands from canvas (shapes deferred to canvas for now)
export {
  defaultCanvasBeginBitmapFill as defaultWebGLBeginBitmapFill,
  defaultCanvasBeginFill as defaultWebGLBeginFill,
  defaultCanvasBeginGradientFill as defaultWebGLBeginGradientFill,
  defaultCanvasCubicCurveTo as defaultWebGLCubicCurveTo,
  defaultCanvasCurveTo as defaultWebGLCurveTo,
  defaultCanvasDrawCircle as defaultWebGLDrawCircle,
  defaultCanvasDrawEllipse as defaultWebGLDrawEllipse,
  defaultCanvasDrawRectangle as defaultWebGLDrawRectangle,
  defaultCanvasDrawRoundRectangle as defaultWebGLDrawRoundRectangle,
  defaultCanvasEndFill as defaultWebGLEndFill,
  defaultCanvasLineStyle as defaultWebGLLineStyle,
  defaultCanvasLineTo as defaultWebGLLineTo,
  defaultCanvasMoveTo as defaultWebGLMoveTo,
  defaultCanvasShapeCommands as defaultWebGLShapeCommands,
  registerCanvasShapeCommands as registerWebGLShapeCommands,
} from '@flighthq/render-canvas';
