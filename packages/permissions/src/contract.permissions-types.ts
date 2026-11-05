// Acyclic build entry selected by contract-only projects through the `.permissions-types` module suffix.
// The published @flighthq/permissions/contract entry remains contract.ts, which adds the runtime barrel.
export type * from './types.ts';
