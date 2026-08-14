import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findHandRolledHermeticity, stripLineComments } from './handRolledHermeticity';

describe('findHandRolledHermeticity', () => {
  // The case the hand-written grep got wrong three times in one day, and the whole reason this is a
  // script: a CONVERTED file whose comment explains the removal names both tokens, and a token match
  // counts it as still hand-rolling. The better the comment, the worse the measurement.
  it('does not count a converted file whose COMMENT names resetModules and doMock', () => {
    const file = write(`
      // This file used to call vi.resetModules() and vi.doMock() in beforeAll; both were removed when
      // the isolated tier made them redundant.
      vi.mock('./subject', () => ({}));
      import { subject } from './subject';
    `);

    expect(findHandRolledHermeticity([file])).toEqual({ dynamicMocking: [], vestigialReset: [] });
  });

  it('counts a real call site, including one spaced or split across the member access', () => {
    const spaced = write("beforeAll(async () => { vi . doMock ('./x', () => ({})); });");
    const plain = write("beforeAll(async () => { vi.doMock('./x', () => ({})); });");

    expect(findHandRolledHermeticity([spaced, plain]).dynamicMocking).toEqual([spaced, plain]);
  });

  // The two mechanisms are different defects and the arc's denominator is the first: only dynamic
  // mocking rebuilds a transitive graph inside a fixed hook deadline. A vestigial reset is a dead call.
  it('separates dynamic mocking from a vestigial resetModules rather than lumping them', () => {
    const dancing = write("beforeAll(async () => { vi.resetModules(); vi.doMock('./x', () => ({})); });");
    const vestigial = write("vi.hoisted(() => { vi.resetModules(); });\nvi.mock('./x', () => ({}));");

    expect(findHandRolledHermeticity([dancing, vestigial])).toEqual({
      dynamicMocking: [dancing],
      vestigialReset: [vestigial],
    });
  });

  it('reports nothing for a file that mocks entirely through the hoisted form', () => {
    const file = write("vi.mock('./x', () => ({}));\nimport { x } from './x';");

    expect(findHandRolledHermeticity([file])).toEqual({ dynamicMocking: [], vestigialReset: [] });
  });
});

describe('stripLineComments', () => {
  it('removes a trailing comment while leaving the code on the same line', () => {
    expect(stripLineComments('vi.doMock("./x"); // and vi.resetModules() in prose')).toBe('vi.doMock("./x"); ');
  });
});

function write(contents: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'hand-rolled-')), 'sample.test.ts');
  writeFileSync(file, contents);
  return file;
}
