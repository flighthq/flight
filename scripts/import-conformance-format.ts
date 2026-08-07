import type { ImportConformanceScore } from './import-conformance-core';

export function formatImportConformanceScore(score: Readonly<ImportConformanceScore>): string {
  const lines: string[] = [];
  for (const pack of score.packs) {
    lines.push(`${pack.id} ${pack.release} [${pack.variant}]`);
    if (pack.state === 'not-run' || pack.summary === null || pack.outcomes === null) {
      lines.push(`NOT RUN: ${pack.reason ?? 'unspecified'}`);
      continue;
    }
    const { exercised, totalCapabilities } = pack.summary;
    lines.push(
      `exercised-of-total: ${exercised.capabilities}/${totalCapabilities}`,
      `instrumented-of-exercised: ${exercised.instrumented.capabilities}/${exercised.capabilities}`,
      `pass-of-instrumented: ${exercised.instrumented.passedCapabilities}/${exercised.instrumented.capabilities}`,
      `witness-depth: ${exercised.singleWitnessCapabilities} single-witness/${exercised.capabilities} exercised`,
      `outcomes: threw=${pack.outcomes.threw} importedWrong=${pack.outcomes.importedWrong} unsupportedClean=${pack.outcomes.unsupportedClean} silentlyWrong=${pack.outcomes.silentlyWrong}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
