"use client";

import { useState } from "react";

import { parsedPercent, type MapCoverage } from "@/lib/map/coverage.mts";

type CoverageBannerProps = {
  coverage: MapCoverage;
};

export function CoverageBanner({ coverage }: CoverageBannerProps) {
  const [open, setOpen] = useState(false);
  const percent = parsedPercent(coverage);
  const line = `Partial · ${percent}% of files parsed`;

  return (
    <div className="coverage-banner">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {line}
      </button>
      {open ? (
        <p className="coverage-detail">
          {coverage.filesSkipped} skipped · {coverage.importsUnresolved} unresolved imports ·{" "}
          {coverage.reexportsUnresolved} unresolved re-exports · {coverage.failures} failures
        </p>
      ) : null}
    </div>
  );
}
