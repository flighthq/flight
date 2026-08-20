import { getNodeChildAt } from '@flighthq/node/contract';
import type * as ShapeModule from '@flighthq/shape/contract';

// ★ A HOISTED MOCK, NOT A HAND-ROLLED ONE. This file is in REGISTRY_ISOLATED_TESTS, so it already runs
// with its own module registry — the hermeticity the `vi.resetModules()` + `vi.doMock` + dynamic-import
// dance used to buy by hand comes from the platform, for free and with no hook. The dance was not merely
// redundant here: it rebuilt the subject's entire transitive module graph inside a FIXED `beforeAll`
// deadline, which is unbounded work against a fixed clock and the shape of flake that tiering exists to
// remove.
vi.mock('@flighthq/shape/contract', async (importOriginal) => {
  const actual = await importOriginal<typeof ShapeModule>();
  return { ...actual, registerDefaultShapeBoundsCommands: vi.fn() };
});

import { createScene2DFromSvgDocument } from './svgDocument';

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
