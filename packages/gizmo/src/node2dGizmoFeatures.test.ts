import { createCamera2D } from '@flighthq/camera/contract';
import { createRectangle, createVector2 } from '@flighthq/geometry/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject, createScene2D } from '@flighthq/scene2d/contract';
import {
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createShape,
  registerDefaultShapeBoundsCommands,
} from '@flighthq/shape/contract';

import { createNode2DGizmoFeatures } from './node2dGizmoFeatures';

describe('createNode2DGizmoFeatures', () => {
  it('adapts Node2D world bounds, pivot origin, and composed rotation in degrees', () => {
    registerDefaultShapeBoundsCommands();
    const scene = createScene2D();
    const parent = createDisplayObject({ rotation: 15, x: 10, y: 20 });
    const node = createShape({ pivotX: 2, pivotY: 3, rotation: 30, x: 8, y: 9 });
    appendShapeBeginFill(node, 0xffffff);
    appendShapeRectangle(node, 0, 0, 10, 20);
    appendShapeEndFill(node);
    addNodeChild(scene.root, parent);
    addNodeChild(parent, node);
    const features = createNode2DGizmoFeatures();
    const bounds = createRectangle();
    const origin = createVector2();

    expect(features.getWorldBoundsRectangle(bounds, node)).toBe(true);
    features.getWorldOrigin(origin, node);

    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(origin.x).toBeCloseTo(10 + 8 * Math.cos(Math.PI / 12) - 9 * Math.sin(Math.PI / 12), 8);
    expect(origin.y).toBeCloseTo(20 + 8 * Math.sin(Math.PI / 12) + 9 * Math.cos(Math.PI / 12), 8);
    expect(features.getWorldRotation(node)).toBeCloseTo(45, 8);
  });

  it('is independent of camera and overlay state', () => {
    const features = createNode2DGizmoFeatures();
    const camera = createCamera2D(320, 200, { zoom: 2 });

    expect(features).toEqual({
      getWorldBoundsRectangle: expect.any(Function),
      getWorldOrigin: expect.any(Function),
      getWorldRotation: expect.any(Function),
    });
    expect(camera.zoom).toBe(2);
  });
});
