export function assertNever(value: never, description: string): never {
  throw new Error(`Unexpected ${description}: ${String(value)}`);
}
