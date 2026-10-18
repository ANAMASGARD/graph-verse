export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Dynamic path keeps Turbopack from bundling the Redis client for the browser graph.
  const { assertFalkorDbReachable } = await import("./lib/falkordb-client");
  await assertFalkorDbReachable();
}
