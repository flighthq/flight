import type {
  MorphShapeGradientEndpoint,
  MorphShapeGradientEndpointExplanation,
  MorphShapeGradientEndpointReason,
} from '@flighthq/types/contract';

export type { MorphShapeGradientEndpointExplanation, MorphShapeGradientEndpointReason } from '@flighthq/types/contract';

// Pure diagnostic twin of the gradient paint appenders. Returns detached data and keeps diagnostic
// reason strings outside the paint sampling module so applications can tree-shake them independently.
export function explainMorphShapeGradientEndpoints(
  start: Readonly<MorphShapeGradientEndpoint>,
  end: Readonly<MorphShapeGradientEndpoint>,
): MorphShapeGradientEndpointExplanation {
  const issue = getMorphShapeGradientEndpointIssue(start, end);
  return {
    endStopCount: end.colors.length,
    reason: getReason(issue),
    startStopCount: start.colors.length,
    supported: issue === GradientEndpointIssueNone,
  };
}

export function getMorphShapeGradientEndpointIssue(
  start: Readonly<MorphShapeGradientEndpoint>,
  end: Readonly<MorphShapeGradientEndpoint>,
): number {
  const startCount = start.colors.length;
  const endCount = end.colors.length;
  if (startCount === 0 || endCount === 0) return GradientEndpointIssueEmpty;
  if (start.alphas.length !== startCount || start.ratios.length !== startCount) {
    return GradientEndpointIssueStartComponents;
  }
  if (end.alphas.length !== endCount || end.ratios.length !== endCount) {
    return GradientEndpointIssueEndComponents;
  }
  if (startCount !== endCount) return GradientEndpointIssueStopCount;
  return GradientEndpointIssueNone;
}

function getReason(issue: number): MorphShapeGradientEndpointReason {
  if (issue === GradientEndpointIssueEmpty) return 'empty-gradient';
  if (issue === GradientEndpointIssueStartComponents) return 'start-stop-component-count-mismatch';
  if (issue === GradientEndpointIssueEndComponents) return 'end-stop-component-count-mismatch';
  if (issue === GradientEndpointIssueStopCount) return 'stop-count-mismatch';
  return 'ok';
}

const GradientEndpointIssueNone = 0;
const GradientEndpointIssueEmpty = 1;
const GradientEndpointIssueStartComponents = 2;
const GradientEndpointIssueEndComponents = 3;
const GradientEndpointIssueStopCount = 4;
