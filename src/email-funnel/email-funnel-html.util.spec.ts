import { resolveMediaUrl } from './email-funnel-html.util';

describe('resolveMediaUrl', () => {
  it('keeps absolute URLs and prefixes relative paths with the frontend origin', () => {
    expect(
      resolveMediaUrl(
        'https://www.youtube.com/shorts/r6M7vHiJQtU',
        'https://boramarcar.com.br',
      ),
    ).toBe('https://www.youtube.com/shorts/r6M7vHiJQtU');

    expect(
      resolveMediaUrl('/email-funnel/agenda-bora-marcar.png', 'https://boramarcar.com.br/'),
    ).toBe('https://boramarcar.com.br/email-funnel/agenda-bora-marcar.png');
  });
});
