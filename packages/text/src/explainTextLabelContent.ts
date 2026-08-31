import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { TextLabel, TextLabelContentExplanation, TextLabelRuntime } from '@flighthq/types/contract';

export function explainTextLabelContent(source: Readonly<TextLabel>): TextLabelContentExplanation {
  const runtime = getNode2DRuntime(source) as TextLabelRuntime;
  const revision = getNodeLocalContentRevision(source);
  const liveString = source.data.text;
  const rasterizedString = runtime.textLayoutUsingText;
  return {
    agreement: rasterizedString === null || liveString === rasterizedString,
    liveString,
    rasterizedString,
    revision,
  };
}
