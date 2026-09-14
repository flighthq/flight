import type { NonEntityCreateResult, SwfTagHandler, SwfTagHandlerRegistry } from '@flighthq/types/contract';

import {
  handleSwfBackgroundColorTag,
  handleSwfBoundedDefinitionTag,
  handleSwfButtonDefinitionTag,
  handleSwfDefineSpriteTag,
  handleSwfDoAbcTag,
  handleSwfDoActionTag,
  handleSwfDoInitActionTag,
  handleSwfEmbeddedImageDefinitionTag,
  handleSwfExportAssetsTag,
  handleSwfFontDefinitionTag,
  handleSwfFontInfoTag,
  handleSwfFrameLabelTag,
  handleSwfJpegTablesTag,
  handleSwfLegacyImageDefinitionTag,
  handleSwfLosslessBitmapDefinitionTag,
  handleSwfPlaceObjectTag,
  handleSwfRemoveObjectTag,
  handleSwfScalingGridTag,
  handleSwfSceneAndFrameLabelDataTag,
  handleSwfSoundDefinitionTag,
  handleSwfSoundStreamBlockTag,
  handleSwfSoundStreamHeadTag,
  handleSwfStartSound2Tag,
  handleSwfStartSoundTag,
  handleSwfVideoStreamDefinitionTag,
} from './swfDocument';

export function createSwfTagHandlerRegistry(): NonEntityCreateResult<SwfTagHandlerRegistry, 'type-only'> {
  return new Map();
}

export function registerAllSwfTagHandlers(registry: SwfTagHandlerRegistry): void {
  registerSwfBitmapTagHandlers(registry);
  registerSwfControlTagHandlers(registry);
  registerSwfFontTagHandlers(registry);
  registerSwfPlacementTagHandlers(registry);
  registerSwfScriptTagHandlers(registry);
  registerSwfShapeTagHandlers(registry);
  registerSwfSoundTagHandlers(registry);
  registerSwfSpriteTagHandlers(registry);
  registerSwfTextTagHandlers(registry);
  registerSwfVideoTagHandlers(registry);
}

export function registerSwfBitmapTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_BITS, handleSwfLegacyImageDefinitionTag);
  registry.set(TAG_DEFINE_BITS_JPEG_2, handleSwfEmbeddedImageDefinitionTag);
  registry.set(TAG_DEFINE_BITS_JPEG_3, handleSwfEmbeddedImageDefinitionTag);
  registry.set(TAG_DEFINE_BITS_JPEG_4, handleSwfEmbeddedImageDefinitionTag);
  registry.set(TAG_DEFINE_BITS_LOSSLESS, handleSwfLosslessBitmapDefinitionTag);
  registry.set(TAG_DEFINE_BITS_LOSSLESS_2, handleSwfLosslessBitmapDefinitionTag);
  registry.set(TAG_JPEG_TABLES, handleSwfJpegTablesTag);
}

export function registerSwfControlTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_BUTTON, handleSwfButtonDefinitionTag);
  registry.set(TAG_DEFINE_BUTTON_2, handleSwfButtonDefinitionTag);
  registry.set(TAG_DEFINE_SCALING_GRID, handleSwfScalingGridTag);
  registry.set(TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA, handleSwfSceneAndFrameLabelDataTag);
  registry.set(TAG_EXPORT_ASSETS, handleSwfExportAssetsTag);
  registry.set(TAG_FRAME_LABEL, handleSwfFrameLabelTag);
  registry.set(TAG_SET_BACKGROUND_COLOR, handleSwfBackgroundColorTag);
  registry.set(TAG_SYMBOL_CLASS, handleSwfExportAssetsTag);
}

export function registerSwfFontTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_FONT, handleSwfFontDefinitionTag);
  registry.set(TAG_DEFINE_FONT_2, handleSwfFontDefinitionTag);
  registry.set(TAG_DEFINE_FONT_3, handleSwfFontDefinitionTag);
  registry.set(TAG_DEFINE_FONT_INFO, handleSwfFontInfoTag);
  registry.set(TAG_DEFINE_FONT_INFO_2, handleSwfFontInfoTag);
}

export function registerSwfPlacementTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_PLACE_OBJECT, handleSwfPlaceObjectTag);
  registry.set(TAG_PLACE_OBJECT_2, handleSwfPlaceObjectTag);
  registry.set(TAG_PLACE_OBJECT_3, handleSwfPlaceObjectTag);
  registry.set(TAG_PLACE_OBJECT_4, handleSwfPlaceObjectTag);
  registry.set(TAG_REMOVE_OBJECT, handleSwfRemoveObjectTag);
  registry.set(TAG_REMOVE_OBJECT_2, handleSwfRemoveObjectTag);
}

export function registerSwfScriptTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DO_ABC, handleSwfDoAbcTag);
  registry.set(TAG_DO_ABC_ANONYMOUS, handleSwfDoAbcTag);
  registry.set(TAG_DO_ACTION, handleSwfDoActionTag);
  registry.set(TAG_DO_INIT_ACTION, handleSwfDoInitActionTag);
}

export function registerSwfShapeTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_MORPH_SHAPE, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_MORPH_SHAPE_2, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_SHAPE, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_SHAPE_2, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_SHAPE_3, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_SHAPE_4, handleSwfBoundedDefinitionTag);
}

export function registerSwfSoundTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_SOUND, handleSwfSoundDefinitionTag);
  registry.set(TAG_SOUND_STREAM_BLOCK, handleSwfSoundStreamBlockTag);
  registry.set(TAG_SOUND_STREAM_HEAD, handleSwfSoundStreamHeadTag);
  registry.set(TAG_SOUND_STREAM_HEAD_2, handleSwfSoundStreamHeadTag);
  registry.set(TAG_START_SOUND, handleSwfStartSoundTag);
  registry.set(TAG_START_SOUND_2, handleSwfStartSound2Tag);
}

export function registerSwfSpriteTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_SPRITE, handleSwfDefineSpriteTag);
}

export function registerSwfTagHandler(registry: SwfTagHandlerRegistry, code: number, handler: SwfTagHandler): void {
  registry.set(code, handler);
}

export function registerSwfTextTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_EDIT_TEXT, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_TEXT, handleSwfBoundedDefinitionTag);
  registry.set(TAG_DEFINE_TEXT_2, handleSwfBoundedDefinitionTag);
}

export function registerSwfVideoTagHandlers(registry: SwfTagHandlerRegistry): void {
  registry.set(TAG_DEFINE_VIDEO_STREAM, handleSwfVideoStreamDefinitionTag);
}

const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_BUTTON = 7;
const TAG_DEFINE_BUTTON_2 = 34;
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_FONT = 10;
const TAG_DEFINE_FONT_2 = 48;
const TAG_DEFINE_FONT_3 = 75;
const TAG_DEFINE_FONT_INFO = 13;
const TAG_DEFINE_FONT_INFO_2 = 62;
const TAG_DEFINE_MORPH_SHAPE = 46;
const TAG_DEFINE_MORPH_SHAPE_2 = 84;
const TAG_DEFINE_SCALING_GRID = 78;
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA = 86;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_2 = 22;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SHAPE_4 = 83;
const TAG_DEFINE_SOUND = 14;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_TEXT_2 = 33;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_DO_ABC = 82;
const TAG_DO_ABC_ANONYMOUS = 72;
const TAG_DO_ACTION = 12;
const TAG_DO_INIT_ACTION = 59;
const TAG_EXPORT_ASSETS = 56;
const TAG_FRAME_LABEL = 43;
const TAG_JPEG_TABLES = 8;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SOUND_STREAM_BLOCK = 19;
const TAG_SOUND_STREAM_HEAD = 18;
const TAG_SOUND_STREAM_HEAD_2 = 45;
const TAG_START_SOUND = 15;
const TAG_START_SOUND_2 = 89;
const TAG_SYMBOL_CLASS = 76;
