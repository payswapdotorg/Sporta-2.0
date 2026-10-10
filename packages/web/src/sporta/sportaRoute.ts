/**
 * /sporta route detection for the web entrypoint (W4C-3). The route
 * mount in main.tsx is minimal; all host code lives in src/sporta/.
 */
export function isSportaPath(pathname: string): boolean {
  return pathname === "/sporta" || pathname === "/cn/sporta";
}
