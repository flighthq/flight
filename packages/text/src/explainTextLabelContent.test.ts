import { setTextLayoutMeasureProvider } from '@flighthq/textlayout/contract';

import { explainTextLabelContent } from './explainTextLabelContent';
import { createTextLabel, setTextLabelString } from './textLabel';
import { ensureTextLayout } from './textLabelLayout';

const measure = (text: string) => text.length * 7;

afterEach(() => {
  setTextLayoutMeasureProvider(null);
});

describe('explainTextLabelContent', () => {
  it('reports agreement when no layout has been computed yet', () => {
    const label = createTextLabel({ data: { text: 'hello' } });

    const explanation = explainTextLabelContent(label);
    expect(explanation.agreement).toBe(true);
    expect(explanation.liveString).toBe('hello');
    expect(explanation.rasterizedString).toBeNull();
  });

  it('reports agreement after setTextLabelString and layout', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'hello');
    ensureTextLayout(label);

    const explanation = explainTextLabelContent(label);
    expect(explanation.agreement).toBe(true);
    expect(explanation.liveString).toBe('hello');
    expect(explanation.rasterizedString).toBe('hello');
  });

  it('reports disagreement when data.text is mutated without setTextLabelString', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'before');
    ensureTextLayout(label);

    label.data.text = 'after';

    const explanation = explainTextLabelContent(label);
    expect(explanation.agreement).toBe(false);
    expect(explanation.liveString).toBe('after');
    expect(explanation.rasterizedString).toBe('before');
  });

  it('includes the content revision', () => {
    const label = createTextLabel();
    const r0 = explainTextLabelContent(label).revision;
    setTextLabelString(label, 'bumped');
    const r1 = explainTextLabelContent(label).revision;
    expect(r1).toBeGreaterThan(r0);
  });
});
