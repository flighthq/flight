import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostPlatformProvider, PlatformInfo, EntityConstruction } from '@flighthq/types/contract';
import {
  detectEndianness,
  parseUserAgentArch,
  parseUserAgentEngine,
  parseUserAgentEngineVersion,
  parseUserAgentKind,
  parseUserAgentName,
  parseUserAgentPointerWidth,
  parseUserAgentRuntime,
  parseUserAgentVersion,
} from '@flighthq/useragent/contract';

export function createWebPlatformBackend(): HostPlatformProvider {
  const out = allocateEntity<HostPlatformProvider>();
  initializeWebPlatformBackend(out);
  return finishEntity(out);
}

export function initializeWebPlatformBackend(out: EntityConstruction<HostPlatformProvider>): void {
  out.getInfo = getWebPlatformInfo;
}

export const webHostPlatform: HostPlatformProvider = createWebPlatformBackend();

function getWebPlatformInfo(out: PlatformInfo): PlatformInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav?.userAgent ?? '';
  out.name = parseUserAgentName(ua);
  out.kind = parseUserAgentKind(out.name);
  out.version = parseUserAgentVersion(ua, out.name);
  out.arch = parseUserAgentArch(ua);
  out.locale = nav?.language ?? '';
  out.isTouch =
    typeof navigator !== 'undefined' && 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : false;
  out.runtime = parseUserAgentRuntime(
    typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null,
  );
  out.engine = parseUserAgentEngine(ua);
  out.engineVersion = parseUserAgentEngineVersion(ua, out.engine);
  out.endianness = detectEndianness();
  out.pointerWidth = parseUserAgentPointerWidth(out.arch);
  // osBuild, distro, distroVersion are native-only; web always returns ''.
  out.osBuild = '';
  out.distro = '';
  out.distroVersion = '';
  return out;
}
