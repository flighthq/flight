import type { TextureContainerParseExplanation } from '@flighthq/types/contract';

import { detectTextureContainer } from './detectTextureContainer.ts';
import { getAtfParseFailureReason } from './parseAtf.ts';
import { getBasisParseFailureReason } from './parseBasis.ts';
import { getDdsParseFailureReason } from './parseDds.ts';
import { getKtx2ParseFailureReason } from './parseKtx2.ts';

// Explains why the detected texture container's parser would return null. Returns null when parsing
// succeeds. The query does not retain payload bytes or expose parser-internal reader state.
export function explainTextureContainerParse(bytes: Readonly<Uint8Array>): TextureContainerParseExplanation | null {
  const container = detectTextureContainer(bytes);
  if (container === null) return { container: null, reason: 'container-unrecognized' };

  const reason = getParseFailureReason(container, bytes);
  return reason === null ? null : { container, reason };
}

function getParseFailureReason(
  container: NonNullable<TextureContainerParseExplanation['container']>,
  bytes: Readonly<Uint8Array>,
): TextureContainerParseExplanation['reason'] | null {
  switch (container) {
    case 'atf':
      return getAtfParseFailureReason(bytes);
    case 'basis':
      return getBasisParseFailureReason(bytes);
    case 'dds':
      return getDdsParseFailureReason(bytes);
    case 'ktx2':
      return getKtx2ParseFailureReason(bytes);
  }
}
