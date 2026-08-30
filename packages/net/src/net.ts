import type { HasNetHttp, NetRequest, NetRequestOptions, NetResponse } from '@flighthq/types/contract';

export function sendNetRequest(
  host: HasNetHttp,
  request: Readonly<NetRequest>,
  options?: Readonly<NetRequestOptions>,
): Promise<NetResponse> {
  return host.net.http.sendNetRequest(request, options);
}
