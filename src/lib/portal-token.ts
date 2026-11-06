const PORTAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function isPortalTokenValid(token: string): boolean {
  return PORTAL_TOKEN_PATTERN.test(token);
}
