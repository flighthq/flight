import { enableHostWebVideoCapability } from '@flighthq/host-web';
import { canPlayVideoType, resetVideoCapabilityBackendForTest } from '@flighthq/video/contract';

export interface VideoCapabilityBrowserResult {
  actual: boolean | null;
  allocations: number;
  detail: string;
  expected: boolean | null;
  id: string;
  mimeType: string | null;
  status: 'fail' | 'pass';
}

export interface VideoCapabilityBrowserReport {
  results: VideoCapabilityBrowserResult[];
  status: 'fail' | 'pass';
}

export function runVideoCapabilityBrowserProbe(): VideoCapabilityBrowserReport {
  let videoAllocations = 0;
  const createElement = document.createElement.bind(document);
  const ownCreateElement = Object.getOwnPropertyDescriptor(document, 'createElement');
  Object.defineProperty(document, 'createElement', {
    configurable: true,
    value(tagName: string, options?: ElementCreationOptions): HTMLElement {
      if (tagName.toLowerCase() === 'video') videoAllocations += 1;
      return createElement(tagName, options);
    },
  });

  const results: VideoCapabilityBrowserResult[] = [];
  try {
    resetVideoCapabilityBackendForTest();
    results.push(runCase('before-enable', 'video/mp4', false, 0));

    const allocationsBeforeEnable = videoAllocations;
    enableHostWebVideoCapability();
    results.push(
      createResult(
        'enable',
        null,
        videoAllocations === allocationsBeforeEnable,
        true,
        videoAllocations - allocationsBeforeEnable,
      ),
    );
    results.push(runCase('empty-mime', '', false, 0));
    results.push(runCase('non-empty-first', 'video/mp4', null, 1));
    results.push(runCase('non-empty-second', 'video/mp4', null, 1));
  } finally {
    resetVideoCapabilityBackendForTest();
    if (ownCreateElement === undefined) delete (document as { createElement?: unknown }).createElement;
    else Object.defineProperty(document, 'createElement', ownCreateElement);
  }

  return { results, status: results.every((result) => result.status === 'pass') ? 'pass' : 'fail' };

  function runCase(
    id: string,
    mimeType: string,
    expected: boolean | null,
    expectedAllocations: number,
  ): VideoCapabilityBrowserResult {
    const allocationsBefore = videoAllocations;
    const actual = canPlayVideoType(mimeType);
    return createResult(id, mimeType, actual, expected, videoAllocations - allocationsBefore, expectedAllocations);
  }
}

function createResult(
  id: string,
  mimeType: string | null,
  actual: boolean,
  expected: boolean | null,
  allocations: number,
  expectedAllocations = 0,
): VideoCapabilityBrowserResult {
  const valueMatches = expected === null || actual === expected;
  const allocationMatches = allocations === expectedAllocations;
  return {
    actual,
    allocations,
    detail: `${expected === null ? `browser returned ${String(actual)}` : `value ${valueMatches ? 'matched' : 'did not match'} ${String(expected)}`}; allocated ${allocations} video element(s), expected ${expectedAllocations}`,
    expected,
    id,
    mimeType,
    status: valueMatches && allocationMatches ? 'pass' : 'fail',
  };
}
