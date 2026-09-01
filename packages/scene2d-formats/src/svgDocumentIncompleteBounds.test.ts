import { getNodeChildAt } from '@flighthq/node/contract';
import * as shapeContract from '@flighthq/shape/contract';

import { createScene2DFromSvgDocument } from './svgDocument';

beforeEach(() => {
  shapeContract.clearShapeBoundsCommands();
  vi.spyOn(shapeContract, 'registerDefaultShapeBoundsCommands').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  shapeContract.registerDefaultShapeBoundsCommands();
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
