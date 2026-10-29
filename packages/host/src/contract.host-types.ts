// Acyclic build entry selected by contract-only projects through the `.host-types` module suffix: the
// generated host vocabulary, which imports nothing from @flighthq/types. The published
// @flighthq/host/contract entry remains contract.ts, which adds the TypeScript companions.
export * from './backendExplanation.ts';
export * from './backendOperationExplanation.ts';
export * from './hostExplanation.ts';
export * from './inputIngressSource.ts';
export * from './providerRef.ts';
