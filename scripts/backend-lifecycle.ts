import {
  collectFunctionBodies,
  collectSetterBodies,
  packageNames,
  packageSourceFiles,
} from './backend-lifecycle-collect';
import {
  collectExplicitHostDestroyOwners,
  createBackendLifecycleReport,
  collectWholeBackendTeardowns,
  formatBackendLifecycleReport,
  hasBackendLifecycleFailure,
} from './backend-lifecycle-core';
import { collectBackendInterfaceNames, collectExplicitHostLifecycleSlots } from './backend-operation-seam-core';

// The backend replacement-lifetime census, as a gate.
//
// ★ WHY THIS FILE EXISTS. The census was only ever a vitest test, so it sat OUTSIDE `npm run check`.
// A slice could delete every ambient setter, leave twelve backends declaring a teardown nothing runs,
// pass the whole-repo check and be attested green — which is exactly what happened. A gate that the
// standard check cannot reach is a gate that eventually goes unrun.
//
// It fails on the same condition the test asserts: any backend that DECLARES a whole-backend teardown
// without a wiring that runs it. It proves nothing about whether that teardown is COMPLETE — see the
// scope caveat the report prints.
const typeFiles = packageSourceFiles('types');
if (typeFiles.length === 0) {
  // A census that cannot see its subject must fail loudly rather than pass vacuously.
  console.error('backend-lifecycle: no packages/types sources found; refusing to report on nothing');
  process.exit(1);
}

const names = collectBackendInterfaceNames(typeFiles).map((name) => `${name}Backend`);
const productionSourceFiles = packageNames().flatMap(packageSourceFiles);
const explicitHostSlots = new Map([
  ['ScreenQueryBackend', 'Host.screen.query'],
  ...collectExplicitHostLifecycleSlots(typeFiles, productionSourceFiles),
]);
const report = createBackendLifecycleReport(
  names,
  collectWholeBackendTeardowns(typeFiles),
  collectSetterBodies(),
  collectFunctionBodies(),
  collectExplicitHostDestroyOwners(productionSourceFiles),
  explicitHostSlots,
);

console.log(formatBackendLifecycleReport(report));

if (hasBackendLifecycleFailure(report)) {
  console.error(`\n✗ ${report.violations.length} backend(s) declare a teardown with no wiring that runs it`);
  process.exit(1);
}
console.log(`\nOK ${report.enforced} of ${report.total} backends declare a teardown, each with a wiring that runs it`);
