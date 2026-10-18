export function refusedByLangSmith(error: unknown): boolean {
  const status = typeof error === "object" && error !== null ? Reflect.get(error, "status") : undefined;
  if (status !== 403) return false;
  console.error(
    "LangSmith refused the request (403). An organization key needs LANGSMITH_WORKSPACE_ID set to the workspace id, then run this again.",
  );
  return true;
}
