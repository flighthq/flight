import { createDisplayObject } from '@flighthq/displayobject';
import { invalidateNodeLocalTransform } from '@flighthq/node';

import { contributeTransformVelocity } from './transformVelocity';
import { beginVelocityFrame, contributeVelocity, createVelocityField, getVelocity } from './velocityField';

describe('contributeTransformVelocity', () => {
  it('reports zero velocity on the first frame', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeTransformVelocity(field, obj);
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('derives velocity from the world-transform delta between frames', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeTransformVelocity(field, obj);

    obj.x = 10;
    obj.y = -5;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeTransformVelocity(field, obj);

    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 10, y: -5 });
  });

  it('lets an explicit contribution override the derived delta regardless of call order', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeTransformVelocity(field, obj);

    obj.x = 100;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeVelocity(field, obj, 2, 2); // explicit set before the baseline runs
    contributeTransformVelocity(field, obj);

    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 2, y: 2 });
  });

  it('still updates previousWorldTransform when an explicit override is in effect', () => {
    const field = createVelocityField();
    const obj = createDisplayObject();
    contributeTransformVelocity(field, obj);
    obj.x = 10;
    invalidateNodeLocalTransform(obj);
    beginVelocityFrame(field);
    contributeVelocity(field, obj, 99, 99);
    contributeTransformVelocity(field, obj);
    // On the third frame with no explicit override, previousWorldTransform should reflect frame 2 position.
    beginVelocityFrame(field);
    contributeTransformVelocity(field, obj);
    // No movement between frame 2 and frame 3 — velocity should be zero.
    expect(getVelocity(field, obj, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
