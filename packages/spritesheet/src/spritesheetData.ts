export type SpritesheetAnimationDirection = 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';

export interface SpritesheetAnimationData {
  direction: SpritesheetAnimationDirection;
  frameDuration: number;
  frameDurations: number[] | null;
  frameNames: string[];
  loop: boolean;
  name: string;
  originX: number;
  originY: number;
}

export interface SpritesheetFrameData {
  height: number;
  name: string;
  offsetX: number;
  offsetY: number;
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}

export interface SpritesheetData {
  animations: SpritesheetAnimationData[];
  frames: SpritesheetFrameData[];
  imageFile: string;
  imageHeight: number;
  imageWidth: number;
  scale: number;
}

export function createSpritesheetAnimationData(obj?: Partial<SpritesheetAnimationData>): SpritesheetAnimationData {
  return {
    direction: obj?.direction ?? 'forward',
    frameDuration: obj?.frameDuration ?? 100,
    frameDurations: obj?.frameDurations ?? null,
    frameNames: obj?.frameNames ?? [],
    loop: obj?.loop ?? true,
    name: obj?.name ?? '',
    originX: obj?.originX ?? 0,
    originY: obj?.originY ?? 0,
  };
}

export function createSpritesheetData(obj?: Partial<SpritesheetData>): SpritesheetData {
  return {
    animations: obj?.animations ?? [],
    frames: obj?.frames ?? [],
    imageFile: obj?.imageFile ?? '',
    imageHeight: obj?.imageHeight ?? 0,
    imageWidth: obj?.imageWidth ?? 0,
    scale: obj?.scale ?? 1,
  };
}

export function createSpritesheetFrameData(obj?: Partial<SpritesheetFrameData>): SpritesheetFrameData {
  return {
    height: obj?.height ?? 0,
    name: obj?.name ?? '',
    offsetX: obj?.offsetX ?? 0,
    offsetY: obj?.offsetY ?? 0,
    pivotX: obj?.pivotX ?? null,
    pivotY: obj?.pivotY ?? null,
    rotated: obj?.rotated ?? false,
    sourceHeight: obj?.sourceHeight ?? 0,
    sourceWidth: obj?.sourceWidth ?? 0,
    width: obj?.width ?? 0,
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
  };
}
