// Functional test scene. Runs unchanged on Canvas, DOM, and Gl — the harness (@ft/render) provides
// the backend-specific wiring at runtime. Build the scene in fixed logical coordinates (width × height);
// do not divide by scale. Declare every node kind you construct in `kinds`.
import { addNodeChild, createDisplayContainer, createShape, ShapeKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [ShapeKind],
});

const root = createDisplayContainer();
// TODO: build the scene using `width` × `height` as the logical canvas, addNodeChild(root, …)
void width;
void height;
void createShape;
void addNodeChild;

render(root);
