import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';
import {
  buildStrokePathGeometry,
  StrokePathTessellationIssueNone,
  StrokePathTessellationIssueSelfIntersectingCenterline,
} from './strokePathGeometry';

describe('buildStrokePathGeometry', () => {
  it('builds paired closed-ring sections and reports pathological centerlines', () => {
    const rectangle = createPath();
    appendPathRectangle(rectangle, 0, 0, 100, 50);
    const valid = buildStrokePathGeometry(rectangle, { width: 10 }, 0.25);
    expect(valid.issue).toBe(StrokePathTessellationIssueNone);
    expect(valid.pieces).toHaveLength(1);
    expect(valid.pieces[0].closed).toBe(true);
    expect(valid.pieces[0].left.length).toBe(valid.pieces[0].right.length);

    const crossing = createPath();
    appendPathMoveTo(crossing, 0, 0);
    appendPathLineTo(crossing, 40, 40);
    appendPathLineTo(crossing, 0, 40);
    appendPathLineTo(crossing, 40, 0);
    const invalid = buildStrokePathGeometry(crossing, { width: 10 }, 0.25);
    expect(invalid.issue).toBe(StrokePathTessellationIssueSelfIntersectingCenterline);
    expect(invalid.issueSubpath).toBe(0);
  });
});
