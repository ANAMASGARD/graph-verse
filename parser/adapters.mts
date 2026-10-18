// Framework knowledge plugs in here. Detection order is first match wins.
// Next and Nest come before Express because both can sit on top of it.
// Express comes before React because an Express app may also import React.
// The fallback is last because it always applies.

import { expressAdapter } from "./adapters/express.mts";
import { nestAdapter } from "./adapters/nest.mts";
import { nextAdapter } from "./adapters/next.mts";
import { reactAdapter } from "./adapters/react.mts";
import { GENERIC_ROLE, GENERIC_SOURCE } from "./adapters/generic.mts";

export interface AdapterFile {
  path: string;
  folder: string;
  module: string;
  source: string;
}

export interface FileRole {
  path: string;
  role: string;
  roleSource: string;
}

export interface AdapterRoute {
  method: string;
  pattern: string;
  file: string;
  line: number;
}

export interface AdapterAssignment {
  framework: string | null;
  roles: readonly FileRole[];
  routes: readonly AdapterRoute[];
}

export interface FrameworkAdapter {
  readonly id: string;
  applies(files: readonly AdapterFile[]): boolean;
  assign(files: readonly AdapterFile[]): AdapterAssignment;
}

const fallbackAdapter: FrameworkAdapter = {
  id: "fallback",
  applies() {
    return true;
  },
  assign(files) {
    return {
      framework: null,
      routes: [],
      roles: files.map((file) => ({
        path: file.path,
        role: GENERIC_ROLE,
        roleSource: GENERIC_SOURCE,
      })),
    };
  },
};

const adapters: readonly FrameworkAdapter[] = [
  nextAdapter,
  nestAdapter,
  expressAdapter,
  reactAdapter,
  fallbackAdapter,
];

export function selectAdapter(files: readonly AdapterFile[]): FrameworkAdapter {
  for (const adapter of adapters) {
    if (adapter.applies(files)) return adapter;
  }
  return fallbackAdapter;
}
