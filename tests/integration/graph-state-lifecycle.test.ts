import { addChild, createDisplayObject, getLocalBoundsRect, getLocalTransform, removeChild } from '@flighthq/stage';
import { GraphState } from '@flighthq/types';

it('should allow undefined when first created', () => {
  const object = createDisplayObject();
  expect(object[GraphState.SymbolKey]).toBeUndefined();
});

it('should become defined when fetching bounds', () => {
  const object = createDisplayObject();
  getLocalBoundsRect(object);
  expect(object[GraphState.SymbolKey]).not.toBeUndefined();
});

it('should become defined when fetching transform', () => {
  const object = createDisplayObject();
  getLocalTransform(object);
  expect(object[GraphState.SymbolKey]).not.toBeUndefined();
});

it('should become defined when adding as a child', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  expect(child[GraphState.SymbolKey]).not.toBeUndefined();
});

it('should remain defined, even when removed', () => {
  const parent = createDisplayObject();
  const child = createDisplayObject();
  addChild(parent, child);
  removeChild(parent, child);
  expect(child[GraphState.SymbolKey]).not.toBeUndefined();
});
