import { appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { PathMorphIssueNone, buildPathMorph, initializePathMorph } from './pathMorphGeometry';

describe('buildPathMorph', () => {
  it('returns the prepared buffers with the internal success issue', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 1, 0);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 2, 0);

    const result = buildPathMorph(start, end);

    expect(result.issue).toBe(PathMorphIssueNone);
    expect(result.morph).not.toBeNull();
  });
});
describe('initializePathMorph', () => {
  it('is the construction initializer of createPathMorph', () => {
    expect(typeof initializePathMorph).toBe('function');
  });
});
