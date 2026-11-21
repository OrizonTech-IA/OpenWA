/**
 * The account gateway serves the OpenWA dashboard below `/platform`, while Vite
 * development serves it at `/`. Keep the router aligned with whichever entry
 * point the current document uses.
 */
export function resolveRouterBasename(pathname: string): '/platform' | undefined {
  return pathname === '/platform' || pathname.startsWith('/platform/') ? '/platform' : undefined;
}
