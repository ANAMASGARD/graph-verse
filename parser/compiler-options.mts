import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const cache = new Map<string, ts.CompilerOptions>();

function defaultOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
  };
}

function nearestConfig(directory: string, root: string): string | null {
  let current = directory;
  while (true) {
    const tsconfig = path.join(current, "tsconfig.json");
    if (fs.existsSync(tsconfig)) return tsconfig;
    const jsconfig = path.join(current, "jsconfig.json");
    if (fs.existsSync(jsconfig)) return jsconfig;
    if (current === root) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function compilerOptionsFor(fileAbsolute: string, root: string): ts.CompilerOptions {
  const config = nearestConfig(path.dirname(fileAbsolute), root);
  if (config === null) return defaultOptions();
  const cached = cache.get(config);
  if (cached) return cached;
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error) {
    throw new Error(
      `cannot read ${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(config),
  );
  cache.set(config, parsed.options);
  return parsed.options;
}

export function clearCompilerOptionsCache(): void {
  cache.clear();
}
