import { reportTextBidiCompactTableMiss, setTextBidiGuard } from './textBidiGuards';

afterEach(() => setTextBidiGuard(null));

describe('reportTextBidiCompactTableMiss', () => {
  it('is silent when no guard is installed', () => {
    expect(() => reportTextBidiCompactTableMiss(0x4e2d)).not.toThrow();
  });
});

describe('setTextBidiGuard', () => {
  it('replaces the active callback', () => {
    const first: number[] = [];
    const second: number[] = [];
    setTextBidiGuard((codepoint) => first.push(codepoint));
    setTextBidiGuard((codepoint) => second.push(codepoint));
    reportTextBidiCompactTableMiss(0x4e2d);
    expect(first).toEqual([]);
    expect(second).toEqual([0x4e2d]);
  });
});
