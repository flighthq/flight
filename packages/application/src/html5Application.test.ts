import { createHtml5Application } from './html5Application';

describe('createHtml5Application', () => {
  it('is an alias for createApplication', () => {
    const app = createHtml5Application();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();
  });
});
