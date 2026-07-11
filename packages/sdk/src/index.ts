export * from '@flighthq/accessibility';
export * from '@flighthq/adjustments';
export * from '@flighthq/animation';
export * from '@flighthq/app';
export * from '@flighthq/application';
export * from '@flighthq/assets';
export * from '@flighthq/audio';
export * from '@flighthq/binpack';
export * from '@flighthq/bitmapfont';
export * from '@flighthq/bitmapfont-formats';
export * from '@flighthq/bitmaptext';
export * from '@flighthq/camera';
export * from '@flighthq/camera2d';
export * from '@flighthq/capture';
export * from '@flighthq/clip';
export * from '@flighthq/clipboard';
export * from '@flighthq/clock';
export * from '@flighthq/collision';
export * from '@flighthq/connectivity';
export * from '@flighthq/debug';
export * from '@flighthq/device';
export * from '@flighthq/dialog';
export * from '@flighthq/displayobject';
export * from '@flighthq/displayobject-canvas';
export * from '@flighthq/displayobject-dom';
export * from '@flighthq/displayobject-gl';
export * from '@flighthq/displayobject-wgpu';
export * from '@flighthq/easing';
export * from '@flighthq/effects';
export * from '@flighthq/effects-canvas';
export * from '@flighthq/effects-gl';
export * from '@flighthq/effects-wgpu';
export * from '@flighthq/entity';
export * from '@flighthq/filesystem';
export * from '@flighthq/filters';
export * from '@flighthq/filters-canvas';
export * from '@flighthq/filters-css';
export * from '@flighthq/filters-gl';
export * from '@flighthq/filters-math';
export * from '@flighthq/filters-surface';
export * from '@flighthq/filters-wgpu';
export * from '@flighthq/flow';
export * from '@flighthq/font';
export * from '@flighthq/geolocation';
export * from '@flighthq/geometry';
export * from '@flighthq/glyphatlas';
export * from '@flighthq/haptics';
export * from '@flighthq/image';
export * from '@flighthq/image-codec';
export * from '@flighthq/input';
export * from '@flighthq/interaction';
export * from '@flighthq/intl';
export * from '@flighthq/ipc';
export * from '@flighthq/keyboard';
export * from '@flighthq/lifecycle';
export * from '@flighthq/lighting';
export * from '@flighthq/loader';
export * from '@flighthq/log';
export * from '@flighthq/materials';
export * from '@flighthq/math';
export * from '@flighthq/media';
export * from '@flighthq/mediasession';
export * from '@flighthq/menu';
export * from '@flighthq/mesh';
export * from '@flighthq/motionpath';
export * from '@flighthq/movieclip';
export * from '@flighthq/net';
export * from '@flighthq/node';
export * from '@flighthq/notification';
export * from '@flighthq/particleemitter';
export * from '@flighthq/particles';
export * from '@flighthq/particles-formats';
export * from '@flighthq/path';
export * from '@flighthq/path-boolean';
export * from '@flighthq/path-formats';
export * from '@flighthq/permissions';
export * from '@flighthq/picking';
export * from '@flighthq/platform';
export * from '@flighthq/power';
export * from '@flighthq/protocol';
export * from '@flighthq/render';
export * from '@flighthq/render-gl';
export * from '@flighthq/render-wgpu';
export * from '@flighthq/scene';
export * from '@flighthq/scene-formats';
export * from '@flighthq/scene-gl';
export * from '@flighthq/scene-wgpu';
export * from '@flighthq/screen';
export * from '@flighthq/sensors';
export * from '@flighthq/shape';
export * from '@flighthq/shape-formats';
export * from '@flighthq/share';
export * from '@flighthq/shell';
export * from '@flighthq/shortcut';
export * from '@flighthq/signals';
export * from '@flighthq/skeleton';
export * from '@flighthq/snapshot';
export * from '@flighthq/socket';
export * from '@flighthq/spatial';
export * from '@flighthq/spring';
export * from '@flighthq/sprite';
export * from '@flighthq/spritesheet';
export * from '@flighthq/spritesheet-formats';
export * from '@flighthq/statusbar';
export * from '@flighthq/storage';
export * from '@flighthq/surface';
export * from '@flighthq/text';
export * from '@flighthq/text-markup';
export * from '@flighthq/textbidi';
export * from '@flighthq/textinput';
export * from '@flighthq/textlayout';
export * from '@flighthq/textsegment';
export * from '@flighthq/textshaper';
export * from '@flighthq/textshaper-canvas';
export * from '@flighthq/texture';
export * from '@flighthq/texture-formats';
export * from '@flighthq/textureatlas';
export * from '@flighthq/textureatlas-formats';
export * from '@flighthq/tilemap-formats';
export * from '@flighthq/tileset';
export * from '@flighthq/timeline';
export * from '@flighthq/tray';
export * from '@flighthq/tween';
export * from '@flighthq/types';
export * from '@flighthq/updater';
export * from '@flighthq/useragent';
export * from '@flighthq/velocity';
export * from '@flighthq/video';
export * from '@flighthq/webcam';
export * from '@flighthq/xml';

// Transitional: @flighthq/adjustments is the canonical home for the color-matrix fuse primitives,
// but @flighthq/filters still ships a verbatim copy until it retires (see effect-adjustment-architecture.md,
// migration step 4). Both star-export the same names, so these explicit re-exports resolve the barrel to
// the adjustments copy. Remove this block once the filters* packages are deleted.
export {
  applyColorMatrixToColor,
  COLOR_MATRIX_LENGTH,
  concatColorMatrix,
  createBrightnessColorMatrix,
  createChannelMixerColorMatrix,
  createColorBalanceColorMatrix,
  createColorMatrixFromTint,
  createContrastColorMatrix,
  createDesaturateColorMatrix,
  createGrayscaleColorMatrix,
  createHueRotateColorMatrix,
  createIdentityColorMatrix,
  createInvertColorMatrix,
  createLevelsColorMatrix,
  createOpacityColorMatrix,
  createPolaroidColorMatrix,
  createSaturationColorMatrix,
  createSepiaColorMatrix,
  createTechnicolorColorMatrix,
  createVintageColorMatrix,
  createWhiteBalanceColorMatrix,
  multiplyColorMatrix,
} from '@flighthq/adjustments';

// Transitional: @flighthq/effects is the canonical home for the spatial-effect blur math, ported
// verbatim from @flighthq/filters-math, which keeps its copy until the filters* packages retire (see
// effect-adjustment-architecture.md, migration step 4). Both star-export the same names, so these
// explicit re-exports resolve the barrel to the effects copy. Remove this block once filters-math is deleted.
export {
  computeBoxBlurPassRadius,
  computeBoxBlurRadius,
  computeGaussianKernelWeights,
  computeGaussianSigmaForBlurRadius,
  computeLinearSampledGaussian,
  getBlurDownsampleLevel,
  getBlurResidualSigma,
  getGaussianKernelSize,
  getLinearSampledGaussianTapCount,
} from '@flighthq/effects';
