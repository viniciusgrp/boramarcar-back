export function isProductionAppEnv(appEnv?: string | null): boolean {
  return appEnv?.trim().toLowerCase() === 'production';
}
