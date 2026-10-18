// Counts the banner needs. Derived from the parser's coverage report at
// store time. The checked-in result is gone; this is the stored figure.

export type MapCoverage = {
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  importsUnresolved: number;
  reexportsUnresolved: number;
  failures: number;
};

export function parsedPercent(coverage: MapCoverage): number {
  if (coverage.filesFound === 0) return 0;
  return Math.round((coverage.filesParsed / coverage.filesFound) * 100);
}

export function isPartialCoverage(coverage: MapCoverage): boolean {
  if (coverage.filesFound === 0) return true;
  if (coverage.filesParsed < coverage.filesFound) return true;
  if (coverage.importsUnresolved > 0) return true;
  if (coverage.reexportsUnresolved > 0) return true;
  if (coverage.failures > 0) return true;
  return false;
}
