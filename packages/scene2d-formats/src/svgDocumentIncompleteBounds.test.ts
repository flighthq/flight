import { getNodeChildAt } from '@flighthq/node/contract';
import type * as ShapeModule from '@flighthq/shape/contract';

import type * as SvgDocumentModule from './svgDocument';

let createScene2DFromSvgDocument: typeof SvgDocumentModule.createScene2DFromSvgDocument;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('@flighthq/shape/contract', async (importOriginal) => {
    const actual = await importOriginal<typeof ShapeModule>();
    return { ...actual, registerDefaultShapeBoundsCommands: vi.fn() };
  });
  ({ createScene2DFromSvgDocument } = await import('./svgDocument'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/shape/contract');
  vi.resetModules();
});

describe('createScene2DFromSvgDocument incomplete bounds', () => {
  it('rejects a partial child box instead of placing an objectBoundingBox clip from it', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="half" clipPathUnits="objectBoundingBox">
            <rect width="0.5" height="1"/>
          </clipPath>
        </defs>
        <g clip-path="url(#half)"><rect x="10" y="20" width="100" height="50"/></g>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip).toBeNull();
  });
});
