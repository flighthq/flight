export { areSwfGuardsEnabled, disableSwfGuards, enableSwfGuards } from './enableSwfGuards';
export { explainSwfContent } from './swfExplain';
export { registerSwfImageDecoders } from './swfImageDecoder';
export {
  createGlyphOutlineSourcesFromSwf,
  createScene2DFromSwf,
  createScene2DFromSwfWithTagHandlers,
  createScene2DImportFromSwf,
  createScene2DImportFromSwfWithTagHandlers,
  createScene2DSymbolFromSwf,
  readSwfExportedSymbolNames,
  registerSwfScene2DDocumentImporter,
} from './swfDocument';
export {
  createSwfTagHandlerRegistry,
  registerAllSwfTagHandlers,
  registerSwfBitmapTagHandlers,
  registerSwfControlTagHandlers,
  registerSwfFontTagHandlers,
  registerSwfPlacementTagHandlers,
  registerSwfScriptTagHandlers,
  registerSwfShapeTagHandlers,
  registerSwfSoundTagHandlers,
  registerSwfTagHandler,
  registerSwfTextTagHandlers,
  registerSwfVideoTagHandlers,
} from './swfTagRegistry';
