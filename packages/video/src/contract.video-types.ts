// Acyclic build entry selected by contract-only projects through the `.video-types` module suffix.
// The published @flighthq/video/contract entry remains contract.ts, which also exposes runtime helpers.
export type {
  HostVideoCapabilities,
  HostVideoCapability,
  VideoChannel,
  VideoChannelState,
  VideoPlayOptions,
  VideoResource,
  VideoResourceLoadOptions,
  VideoResourceUrl,
} from './types.ts';
