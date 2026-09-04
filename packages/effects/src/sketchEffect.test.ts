import { createSketchEffect, initializeSketchEffect } from './sketchEffect';

describe('createSketchEffect', () => {
  it('tags the intent type', () => {
    expect(createSketchEffect().kind).toBe('SketchEffect');
  });

  it('carries options', () => {
    expect(createSketchEffect({ strength: 0.8 })).toMatchObject({ strength: 0.8 });
  });
});
describe('initializeSketchEffect', () => {
  it('is the construction initializer of createSketchEffect', () => {
    expect(typeof initializeSketchEffect).toBe('function');
  });
});
