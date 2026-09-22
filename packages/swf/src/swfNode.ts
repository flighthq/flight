import { createMovieClip } from '@flighthq/movieclip/contract';
import { getNodeRuntime, invalidateNodeLocalBounds } from '@flighthq/node/contract';
import { createDisplayObject, createSprite } from '@flighthq/scene2d/contract';
import type {
  BoundsNode,
  MorphShape,
  MovieClip,
  MovieClipData,
  Node2D,
  Node2DData,
  Node2DRuntime,
  Node2DTraits,
  NodeData,
  Rectangle,
  Sprite,
  SwfTagRectangle,
  Texture2D,
} from '@flighthq/types/contract';

// The display nodes a SWF character becomes, and the authored-extent hook they all carry. A SWF sizes a
// character by the RECT the authoring tool recorded rather than by the geometry inside it, so every node
// here reports that box through `computeLocalBoundsRectangle` instead of measuring its own content: a
// document that never loads its images still measures correctly, and layout does not shift when pixels
// arrive.

// Sizes a node by the box the authoring tool recorded rather than by the geometry inside it, and points
// its bounds hook at that box. A SWF's RECT includes stroke width and authoring padding the command
// stream does not carry, so it is the extent a document is laid out against.
export function applySwfAuthoredBounds(node: Node2D, bounds: Readonly<SwfTagRectangle> | null): void {
  if (bounds === null) return;
  const data = node.data as unknown as SwfAuthoredBoundsData | null;
  // A bare display object carries no data of its own, so the box becomes its data rather than a field
  // written onto data that is not there.
  if (data === null) node.data = { authoredBounds: { ...bounds } } as unknown as Node2DData;
  else data.authoredBounds = { ...bounds };
  (getNodeRuntime(node) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
}

// Moves a morph's authored box to the ratio its geometry is at. Written in place, because the box is read
// through the bounds hook rather than copied out of it.
export function applySwfMorphBounds(shape: MorphShape, progress: number): void {
  const data = shape.data as unknown as SwfMorphBoundsData;
  const start = data.morphStartBounds;
  const end = data.morphEndBounds;
  if (start === undefined || end === undefined) return;
  data.authoredBounds = {
    height: start.height + (end.height - start.height) * progress,
    width: start.width + (end.width - start.width) * progress,
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
  invalidateNodeLocalBounds(shape);
}

export function computeSwfLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNode<Node2DTraits>>): void {
  const bounds = (source.data as SwfAuthoredBoundsData).authoredBounds;
  out.x = bounds.x;
  out.y = bounds.y;
  out.width = bounds.width;
  out.height = bounds.height;
}

export function createSwfDisplayObject(bounds: SwfTagRectangle | null): ReturnType<typeof createDisplayObject> {
  const target = createDisplayObject();
  applySwfAuthoredBounds(target, bounds);
  return target;
}

// Each placement of a morph character decodes its own node, because a morph's progress is per instance:
// two placements of one character routinely sit at different points along the same morph. A factory that
// declines leaves an empty display object, so the placement keeps its box and its slot reference.
export function createSwfMorphShapeTarget(
  decode: () => MorphShape | null,
  bounds: SwfTagRectangle | null,
  morphBounds: Readonly<{ end: SwfTagRectangle; start: SwfTagRectangle }> | undefined,
): Node2D {
  const shape = decode();
  if (shape === null) return createSwfDisplayObject(bounds);
  if (morphBounds !== undefined) {
    const data = shape.data as unknown as SwfMorphBoundsData;
    data.morphStartBounds = { ...morphBounds.start };
    data.morphEndBounds = { ...morphBounds.end };
    data.authoredBounds = { ...morphBounds.start };
    (getNodeRuntime(shape) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  } else if (bounds !== null) {
    (shape.data as unknown as SwfAuthoredBoundsData).authoredBounds = { ...bounds };
    (getNodeRuntime(shape) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return shape;
}

export function createSwfMovieClip(bounds: SwfTagRectangle | null): MovieClip {
  const clip = createMovieClip();
  if (bounds !== null) {
    (clip.data as SwfMovieClipData).authoredBounds = { ...bounds };
    (getNodeRuntime(clip) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return clip;
}

export function createSwfTexturedSprite(texture: Texture2D, bounds: SwfTagRectangle | null): Sprite {
  const target = createSprite();
  target.data.texture = texture;
  if (bounds !== null) {
    // The authored RECT sizes the node before the image resolves, so layout does not shift when pixels
    // arrive and a document that never loads its images still measures correctly.
    (target.data as unknown as SwfAuthoredBoundsData).authoredBounds = { ...bounds };
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

interface SwfAuthoredBoundsData extends NodeData {
  authoredBounds: SwfTagRectangle;
}

// A morph carries both endpoints' boxes so its authored bounds can be the box it actually occupies at the
// current ratio. The union of the two would be correct for neither endpoint: a morph at rest would report
// room for the shape it is not yet.
interface SwfMorphBoundsData extends SwfAuthoredBoundsData {
  morphEndBounds: SwfTagRectangle;
  morphStartBounds: SwfTagRectangle;
}

interface SwfMovieClipData extends MovieClipData, SwfAuthoredBoundsData {}
