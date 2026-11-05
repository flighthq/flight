// Acyclic build entry selected by contract-only projects through the `.net-types` module suffix.
// The published @flighthq/net/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostNetCapabilities,
  HostNetCapability,
  NetBody,
  NetCredentials,
  NetGuard,
  NetGuardNotice,
  NetMethod,
  NetProgress,
  NetRedirect,
  NetRequest,
  NetRequestOptions,
  NetResponse,
  NetResponseBody,
  NetResponseExplanation,
  NetResponseType,
} from './types.ts';
