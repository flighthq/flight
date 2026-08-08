export interface ImportConformanceDenominatorReading {
  id: string;
  reference?: string;
  value: boolean | number | string;
}

export type ImportConformanceProducerDenominator =
  | {
      declaredRows: 0;
      reason: string;
      state: 'not-applicable';
    }
  | {
      declaredRows: number;
      limitation: string;
      methodology: string;
      readings: readonly ImportConformanceDenominatorReading[];
      state: 'unresolved';
    };

export type ImportConformanceFormatDenominator =
  | { format: string; reason: string; state: 'not-applicable' }
  | { format: string; reason: string; state: 'unmeasured' };

export interface ImportConformanceDenominators {
  format: ImportConformanceFormatDenominator;
  producerDeclared: ImportConformanceProducerDenominator;
}

export function assertImportConformanceDenominators(
  denominators: Readonly<ImportConformanceDenominators>,
  declaredRows: number,
): void {
  if (!Number.isSafeInteger(declaredRows) || declaredRows < 0) throw new Error('Declared rows must be nonnegative');
  assertIdentifier(denominators.format.format, 'Format denominator id');
  if (denominators.format.reason.trim() === '') throw new Error('Format denominator reason must be non-empty');
  if (denominators.format.state !== 'not-applicable' && denominators.format.state !== 'unmeasured') {
    throw new Error('Format denominator state must be not-applicable or unmeasured');
  }

  const producer = denominators.producerDeclared;
  if (producer.state === 'not-applicable') {
    if (declaredRows !== 0 || producer.declaredRows !== 0 || producer.reason.trim() === '') {
      throw new Error('A not-applicable producer denominator requires zero declared rows and a reason');
    }
    return;
  }
  if (producer.state !== 'unresolved')
    throw new Error('Producer denominator state must be unresolved or not-applicable');
  if (producer.declaredRows !== declaredRows || producer.declaredRows < 1) {
    throw new Error('Producer denominator declared rows must match the capability partition');
  }
  assertIdentifier(producer.methodology, 'Producer denominator methodology');
  if (producer.limitation.trim() === '') throw new Error('Producer denominator limitation must be non-empty');
  if (producer.readings.length === 0) throw new Error('An unresolved producer denominator must retain its readings');
  let previous = '';
  for (const reading of producer.readings) {
    assertIdentifier(reading.id, 'Denominator reading id');
    if (reading.id <= previous) throw new Error('Denominator readings must be sorted and unique');
    if (reading.reference !== undefined && reading.reference.trim() === '') {
      throw new Error(`Denominator reading ${reading.id} reference must be non-empty`);
    }
    if (typeof reading.value === 'number' && !Number.isSafeInteger(reading.value)) {
      throw new Error(`Denominator reading ${reading.id} number must be a safe integer`);
    }
    if (typeof reading.value === 'string' && reading.value.trim() === '') {
      throw new Error(`Denominator reading ${reading.id} string must be non-empty`);
    }
    previous = reading.id;
  }
}

export function formatImportConformanceDenominators(denominators: Readonly<ImportConformanceDenominators>): string {
  const producer = denominators.producerDeclared;
  const producerDescription =
    producer.state === 'not-applicable'
      ? `producer-declared capability denominator NOT APPLICABLE (${producer.reason})`
      : `declared capability-row tally ${producer.declaredRows}; producer-declared methodology ${producer.methodology}; producer-declared readings [${producer.readings
          .map(
            (reading) =>
              `${reading.id}=${JSON.stringify(reading.value)}${reading.reference === undefined ? '' : ` @${reading.reference}`}`,
          )
          .join('; ')}]; producer-declared capability denominator UNRESOLVED (${producer.limitation})`;
  const format = denominators.format;
  return `${producerDescription}; ${format.format}-format capability denominator ${format.state.toUpperCase()} (${format.reason})`;
}

function assertIdentifier(value: string, context: string): void {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)) throw new Error(`${context} must be a stable identifier`);
}
