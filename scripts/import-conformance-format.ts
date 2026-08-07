import type { ImportConformanceScore } from './import-conformance-core';

export function formatImportConformanceScore(score: Readonly<ImportConformanceScore>): string {
  const assurance = score.instrumentAssurance;
  const lines = [
    `instrument-assurance: payload-validity=${assurance.payloadValidity} trigger-correctness=${assurance.triggerCorrectness} trigger-scope=${assurance.triggerScope} trigger-specificity=${assurance.triggerSpecificity}`,
  ];
  for (const pack of score.packs) {
    lines.push(`${pack.id} ${pack.release} [${pack.variant}]`);
    if (pack.state === 'not-run') {
      lines.push(`NOT RUN: ${pack.reason ?? 'unspecified'}`);
      continue;
    }
    const { exercised, totalCapabilities } = pack.summary;
    lines.push(
      `exercised-of-total: ${exercised.capabilities}/${totalCapabilities}`,
      `fire-proven-of-exercised: ${exercised.fireProven.capabilities}/${exercised.capabilities}`,
      `pass-of-fire-proven: ${exercised.fireProven.results.passedCapabilities}/${exercised.fireProven.capabilities}`,
      `silence-proven-of-exercised: ${exercised.silenceProven.capabilities}/${exercised.capabilities}`,
      `pass-of-silence-proven: ${exercised.silenceProven.results.passedCapabilities}/${exercised.silenceProven.capabilities}`,
      `witness-depth: ${exercised.singleWitnessCapabilities} single-witness/${exercised.capabilities} exercised`,
    );
  }
  return `${lines.join('\n')}\n`;
}
