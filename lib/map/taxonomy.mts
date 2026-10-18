// Category names the rail shows. Kept out of the adapters so a browser
// component can read them without the parser or a filesystem library.
// Order is reading order: routable surfaces, then the layers behind them,
// then plumbing. A zero count stays, so the same repository keeps each
// category in the same place.

export interface MapRoute {
  method: string;
  pattern: string;
  file: string;
  line: number;
}

const RAIL_ORDER: Record<string, readonly string[]> = {
  "Next.js": [
    "Page routes",
    "API endpoints",
    "Server actions",
    "Layouts",
    "Components",
    "Hooks",
    "Middleware",
    "Config",
  ],
  NestJS: ["Controllers", "Services", "Modules", "Entities"],
  Express: ["Routers", "Controllers", "Services", "Models", "Middleware"],
  React: ["Components", "Hooks"],
};

const FRAMEWORK_REACHED_ROLES = new Set<string>([
  "Page routes",
  "API endpoints",
  "Server actions",
  "Layouts",
  "Middleware",
  "Config",
  "Controllers",
]);

export function railRoles(
  framework: string | null,
  counts: ReadonlyMap<string, number>,
): { role: string; count: number }[] {
  const order = framework === null ? undefined : RAIL_ORDER[framework];
  if (order === undefined) {
    return [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([role, count]) => ({ role, count }));
  }
  const known = new Set(order);
  const listed = order.map((role) => ({ role, count: counts.get(role) ?? 0 }));
  const extra = [...counts.entries()]
    .filter(([role, count]) => !known.has(role) && count > 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([role, count]) => ({ role, count }));
  return [...listed, ...extra];
}

export function reachedByFrameworkRole(role: string): boolean {
  return FRAMEWORK_REACHED_ROLES.has(role);
}
