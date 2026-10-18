export const GENERIC_ROLE = "file";
export const GENERIC_SOURCE = "fallback";

export function genericAssignment(path: string): { path: string; role: string; roleSource: string } {
  return { path, role: GENERIC_ROLE, roleSource: GENERIC_SOURCE };
}
