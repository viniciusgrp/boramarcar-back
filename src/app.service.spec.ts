import { AppService } from './app.service';

describe('AppService', () => {
  it('returns the health greeting', () => {
    expect(new AppService().getHello()).toBe('Hello World!');
  });
});
