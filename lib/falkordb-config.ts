import "server-only";

export type FalkorDbConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
};

const REQUIRED_KEYS = [
  "FALKORDB_HOST",
  "FALKORDB_PORT",
  "FALKORDB_USERNAME",
  "FALKORDB_PASSWORD",
] as const;

function missingKeys(): string[] {
  return REQUIRED_KEYS.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim() === "";
  });
}

/** Reads FalkorDB connection settings from the environment. Throws if any are missing. */
export function getFalkorDbConfig(): FalkorDbConfig {
  const missing = missingKeys();
  if (missing.length > 0) {
    throw new Error(
      `FalkorDB is not configured. Set these in .env.local: ${missing.join(", ")}`,
    );
  }

  const port = Number(process.env.FALKORDB_PORT);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("FALKORDB_PORT must be a positive number.");
  }

  const tlsRaw = process.env.FALKORDB_TLS?.trim().toLowerCase();
  const tls =
    tlsRaw === "true" || tlsRaw === "1"
      ? true
      : tlsRaw === "false" || tlsRaw === "0" || tlsRaw === undefined
        ? false
        : (() => {
            throw new Error('FALKORDB_TLS must be "true" or "false" when set.');
          })();

  return {
    host: process.env.FALKORDB_HOST!.trim(),
    port,
    username: process.env.FALKORDB_USERNAME!.trim(),
    password: process.env.FALKORDB_PASSWORD!,
    tls,
  };
}
