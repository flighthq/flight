import { PathCommand } from '@flighthq/types';

import { appendPathCubicCurveTo, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('appendPathCubicCurveTo', () => {
  it('pushes the cubic verb and its six coordinates', () => {
    const path = createPath();
    appendPathCubicCurveTo(path, 1, 2, 3, 4, 5, 6);
    expect(path.commands).toStrictEqual([PathCommand.CUBIC_CURVE_TO]);
    expect(path.data).toStrictEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('appendPathCurveTo', () => {
  it('pushes the quadratic verb and its four coordinates', () => {
    const path = createPath();
    appendPathCurveTo(path, 1, 2, 3, 4);
    expect(path.commands).toStrictEqual([PathCommand.CURVE_TO]);
    expect(path.data).toStrictEqual([1, 2, 3, 4]);
  });
});

describe('appendPathLineTo', () => {
  it('pushes the line verb and its point', () => {
    const path = createPath();
    appendPathLineTo(path, 7, 8);
    expect(path.commands).toStrictEqual([PathCommand.LINE_TO]);
    expect(path.data).toStrictEqual([7, 8]);
  });
});

describe('appendPathMoveTo', () => {
  it('pushes the move verb and its point', () => {
    const path = createPath();
    appendPathMoveTo(path, 9, 10);
    expect(path.commands).toStrictEqual([PathCommand.MOVE_TO]);
    expect(path.data).toStrictEqual([9, 10]);
  });
});

describe('createPath', () => {
  it('defaults to an empty nonZero path', () => {
    const path = createPath();
    expect(path.commands).toStrictEqual([]);
    expect(path.data).toStrictEqual([]);
    expect(path.winding).toStrictEqual('nonZero');
  });

  it('accepts an evenOdd winding', () => {
    expect(createPath('evenOdd').winding).toStrictEqual('evenOdd');
  });
});
