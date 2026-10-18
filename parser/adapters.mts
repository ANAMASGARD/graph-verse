// Framework knowledge plugs in here. This phase only has the fallback, which
// assumes nothing about the repository. Detection order is first match wins;
// the fallback is last because it always applies.

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
        role: "file",
        roleSource: "fallback",
      })),
    };
  },
};

const adapters: readonly FrameworkAdapter[] = [fallbackAdapter];

export function selectAdapter(files: readonly AdapterFile[]): FrameworkAdapter {
  for (const adapter of adapters) {
    if (adapter.applies(files)) return adapter;
  }
  return fallbackAdapter;
}
