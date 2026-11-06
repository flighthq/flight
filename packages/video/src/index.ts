export {
  canPlayVideoType,
  createVideoResource,
  destroyVideoResource,
  detectVideoMimeType,
  disposeVideoResource,
  getVideoResourceDuration,
  getVideoResourceHeight,
  getVideoResourceWidth,
  hasVideoResourceElement,
  inferVideoMimeType,
  isVideoResourceEmpty,
  isVideoResourceReady,
  loadVideoResourceFromBlob,
  loadVideoResourceFromUrl,
  loadVideoResourceFromUrls,
  selectVideoResourceUrl,
} from './contract.ts';

export type {
  HostVideoCapabilities,
  HostVideoCapability,
  VideoChannel,
  VideoChannelState,
  VideoPlayOptions,
  VideoResource,
  VideoResourceLoadOptions,
  VideoResourceUrl,
} from './contract.ts';
