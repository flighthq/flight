import {
  assertImportConformanceDenominators,
  formatImportConformanceDenominators,
} from './import-conformance-denominator';

describe('import conformance denominators', () => {
  it('validates a format-neutral producer methodology against its declared partition', () => {
    const denominators = {
      format: { format: 'swf', reason: 'format-capability-enumeration-not-declared', state: 'unmeasured' as const },
      producerDeclared: {
        declaredRows: 2,
        limitation: 'individuation-rule-not-operational',
        methodology: 'unresolved-individuation-v1',
        readings: [
          { id: 'candidate-hits', value: 4 },
          { id: 'frozen-declared-rows', value: 2 },
        ],
        state: 'unresolved' as const,
      },
    };
    expect(() => assertImportConformanceDenominators(denominators, 2)).not.toThrow();
    expect(() => assertImportConformanceDenominators(denominators, 3)).toThrow(/match the capability partition/);
  });

  it('supports an oracle-only pack without inventing a capability denominator', () => {
    const denominators = {
      format: { format: 'md5', reason: 'capability-enumeration-not-declared', state: 'not-applicable' as const },
      producerDeclared: { declaredRows: 0 as const, reason: 'oracle-only-pack', state: 'not-applicable' as const },
    };
    expect(() => assertImportConformanceDenominators(denominators, 0)).not.toThrow();
    expect(formatImportConformanceDenominators(denominators)).toBe(
      'producer-declared capability denominator NOT APPLICABLE (oracle-only-pack); md5-format capability denominator NOT-APPLICABLE (capability-enumeration-not-declared)',
    );
  });
});
