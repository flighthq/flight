// Substrate-agnostic render-effect intents. Each is plain data with a `type` discriminant; per-backend
// recipes register a runner against that `type` (registerGlRenderEffect) and the effect pipeline
// dispatches an agnostic RenderEffect[] through the registry, so one intent list drives every backend.
// Colors are packed RGBA integers (e.g. 0x000000ff). Tags in comments mark inputs a recipe needs
// beyond color: [HDR] float target, [DEPTH] sampleable depth, [MOTION] motion vectors, [TEMPORAL] history.

// --- Anti-aliasing ---

export interface FxaaEffect {
  type: 'fxaa';
  // Edge contrast threshold; lower catches more edges. Default 0.0312.
  edgeThreshold?: number;
  subpixel?: number;
}

export interface SmaaEffect {
  type: 'smaa';
  threshold?: number;
}

export interface TaaEffect {
  type: 'taa'; // [TEMPORAL] needs a history buffer + motion vectors.
  feedback?: number;
}

// --- HDR / tone ---

export interface BloomEffect {
  type: 'bloom'; // [HDR]
  threshold?: number; // bright-pass cutoff in linear light. Default 0.8.
  intensity?: number; // additive strength. Default 1.
  radius?: number; // blur radius of the bloom branch. Default 8.
  passes?: number; // blur quality passes. Default 1.
}

export type ToneMapOperator = 'reinhard' | 'aces' | 'filmic' | 'agx' | 'uncharted2';

export interface ToneMapEffect {
  type: 'toneMap'; // [HDR]
  operator?: ToneMapOperator;
  exposure?: number;
  white?: number; // white point (Reinhard extended / filmic).
}

export interface ExposureEffect {
  type: 'exposure'; // [HDR]
  exposure?: number; // stops, applied as 2^exposure. Default 0.
}

// --- Color grading ---

export interface ColorGradeEffect {
  type: 'colorGrade';
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  brightness?: number;
}

export interface LiftGammaGainEffect {
  type: 'liftGammaGain';
  lift?: number; // packed RGBA, neutral 0x808080ff.
  gamma?: number; // packed RGBA.
  gain?: number; // packed RGBA.
}

export interface ChannelMixerEffect {
  type: 'channelMixer';
  matrix: ReadonlyArray<number>; // 3x4 row-major RGB->RGB plus offset.
}

export interface LookupTableGradeEffect {
  type: 'lutGrade';
  size?: number; // cube size of the LUT (e.g. 16, 32).
  strength?: number;
}

export interface WhiteBalanceEffect {
  type: 'whiteBalance';
  temperature?: number; // -1..1 warm/cool.
  tint?: number; // -1..1 magenta/green.
}

export interface PosterizeEffect {
  type: 'posterize';
  levels?: number; // per-channel quantization steps. Default 8.
}

export interface BrightnessContrastEffect {
  type: 'brightnessContrast';
  brightness?: number;
  contrast?: number;
}

export interface HueSaturationEffect {
  type: 'hueSaturation';
  hue?: number; // degrees.
  saturation?: number;
  lightness?: number;
}

export interface GrayscaleEffect {
  type: 'grayscale';
  intensity?: number; // 0..1 mix. Default 1.
}

export interface SepiaEffect {
  type: 'sepia';
  intensity?: number;
}

export interface InvertEffect {
  type: 'invert';
  intensity?: number;
}

// --- Lens ---

export interface VignetteEffect {
  type: 'vignette';
  intensity?: number;
  radius?: number;
  softness?: number;
  color?: number; // packed RGBA. Default 0x000000ff.
}

export interface ChromaticAberrationEffect {
  type: 'chromaticAberration';
  intensity?: number;
  radial?: boolean; // increase toward screen edges (lens-like). Default true.
}

export interface LensDistortionEffect {
  type: 'lensDistortion';
  amount?: number; // + barrel, - pincushion.
  scale?: number;
}

export interface LensFlareEffect {
  type: 'lensFlare'; // [HDR]
  threshold?: number;
  intensity?: number;
  ghosts?: number;
  halo?: number;
}

// Lens dirt: smudges/dust on the lens that catch the light — procedural soft blobs brighten where the
// scene is bright, a cheap bloom-dirt overlay. `seed` varies the smudge layout.
export interface LensDirtEffect {
  type: 'lensDirt';
  intensity?: number; // brightness added through the dirt. Default 1.
  threshold?: number; // scene luminance above which dirt catches light. Default 0.55.
  seed?: number; // smudge layout.
}

// Heat-haze / shimmer: warp the sample position by an animated sine field for a refractive-air or
// underwater wobble. `seed` animates it frame to frame.
export interface DisplacementEffect {
  type: 'displacement';
  intensity?: number; // max warp in pixels. Default 8.
  frequency?: number; // wave count across the frame. Default 12.
  seed?: number; // animate frame to frame.
}

export interface BokehDepthOfFieldEffect {
  type: 'bokehDoF'; // [DEPTH]
  focusDistance?: number;
  focusRange?: number;
  maxBlur?: number;
}

export interface TiltShiftEffect {
  type: 'tiltShift';
  center?: number; // 0..1 focus band center on Y.
  width?: number; // focus band height.
  blur?: number;
}

// --- Motion ---

export interface CameraMotionBlurEffect {
  type: 'cameraMotionBlur'; // [MOTION]
  intensity?: number;
  samples?: number;
}

export interface DirectionalBlurEffect {
  type: 'directionalBlur';
  angle?: number; // radians.
  length?: number;
  samples?: number;
}

export interface MotionBlurEffect {
  type: 'motionBlur'; // [MOTION] per-object motion blur from the scene velocity buffer.
  intensity?: number;
  samples?: number;
}

export interface RadialBlurEffect {
  type: 'radialBlur';
  centerX?: number; // 0..1.
  centerY?: number;
  strength?: number;
  samples?: number;
}

// --- Atmospheric / depth ---

export interface ScreenSpaceFogEffect {
  type: 'screenSpaceFog'; // [DEPTH]
  color?: number;
  near?: number;
  far?: number;
  density?: number;
}

export interface GodRaysEffect {
  type: 'godRays'; // [HDR]
  centerX?: number;
  centerY?: number;
  density?: number;
  decay?: number;
  weight?: number;
  exposure?: number;
  samples?: number;
}

export interface SsaoEffect {
  type: 'ssao'; // [DEPTH]
  radius?: number;
  intensity?: number;
  bias?: number;
  samples?: number;
}

export interface SsrEffect {
  type: 'ssr'; // [DEPTH]
  maxDistance?: number;
  resolution?: number;
  steps?: number;
}

// --- Stylization ---

export interface FilmGrainEffect {
  type: 'filmGrain';
  intensity?: number;
  size?: number;
  seed?: number;
}

// Digital glitch: horizontal block tears (rows displaced by a per-block hash), RGB channel separation,
// and occasional bright scanline corruption. `seed` animates it frame to frame (data-moshing look).
export interface GlitchEffect {
  type: 'glitch';
  intensity?: number; // overall strength 0..1; scales tear displacement + corruption frequency.
  blockSize?: number; // height in pixels of a tear block (smaller = finer tearing). Default 24.
  colorShift?: number; // RGB channel separation in pixels at full tear. Default 8.
  seed?: number; // animate frame to frame.
}

export interface ScanlinesEffect {
  type: 'scanlines';
  count?: number;
  intensity?: number;
}

export interface CRTEffect {
  type: 'crt';
  curvature?: number;
  scanlineIntensity?: number;
  vignette?: number;
  aberration?: number;
}

export interface PixelateEffect {
  type: 'pixelate';
  size?: number; // block size in pixels.
}

export interface HalftoneEffect {
  type: 'halftone';
  scale?: number;
  angle?: number;
}

export interface DitherEffect {
  type: 'dither';
  levels?: number;
}

export interface OutlineEffect {
  type: 'outline';
  threshold?: number;
  thickness?: number;
  color?: number;
}

export interface SharpenEffect {
  type: 'sharpen';
  amount?: number;
}

export interface KuwaharaEffect {
  type: 'kuwahara';
  radius?: number;
}

export interface SketchEffect {
  type: 'sketch';
  strength?: number;
}

export type RenderEffect =
  | BloomEffect
  | BokehDepthOfFieldEffect
  | BrightnessContrastEffect
  | CameraMotionBlurEffect
  | CRTEffect
  | ChannelMixerEffect
  | ChromaticAberrationEffect
  | ColorGradeEffect
  | DirectionalBlurEffect
  | DisplacementEffect
  | DitherEffect
  | ExposureEffect
  | FxaaEffect
  | FilmGrainEffect
  | GlitchEffect
  | GodRaysEffect
  | GrayscaleEffect
  | HalftoneEffect
  | HueSaturationEffect
  | InvertEffect
  | KuwaharaEffect
  | LensDirtEffect
  | LensDistortionEffect
  | LensFlareEffect
  | LiftGammaGainEffect
  | LookupTableGradeEffect
  | MotionBlurEffect
  | OutlineEffect
  | PixelateEffect
  | PosterizeEffect
  | RadialBlurEffect
  | SmaaEffect
  | SsaoEffect
  | SsrEffect
  | ScanlinesEffect
  | ScreenSpaceFogEffect
  | SepiaEffect
  | SharpenEffect
  | SketchEffect
  | TaaEffect
  | TiltShiftEffect
  | ToneMapEffect
  | VignetteEffect
  | WhiteBalanceEffect;
