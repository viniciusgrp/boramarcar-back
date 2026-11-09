import {
  DEFAULT_ADMIN_ACCENT_DARK,
  DEFAULT_ADMIN_ACCENT_LIGHT,
} from './brand.constants';

describe('brand accents', () => {
  it('uses petróleo as the default admin accent', () => {
    expect(DEFAULT_ADMIN_ACCENT_LIGHT).toBe('#0F5F58');
    expect(DEFAULT_ADMIN_ACCENT_DARK).toBe('#4FD1C0');
  });
});
