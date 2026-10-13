/**
 * TransformStudio — the studio root render surface (W9C-8).
 *
 * EVIDENCE CLASS (the UI honesty law, SportaPanel precedent):
 * BUILD-VERIFIED/UNTESTED — `pnpm exec tsc -b packages/web` compiles
 * it into the src tree; no browser test harness exists in this repo
 * and none is claimed. The panel renders whatever the injected
 * `TransformStudioHostPort` reports; the pure view-model modules the
 * tab components consume are battery-tested (see
 * packages/sporta-app-environments test/studioViews.test.ts).
 *
 * Surface law: read-only studio views + EXACTLY one write path (the
 * launch selection confirmation gate — LaunchTab).
 */
import { useState } from "react";
import type { TransformStudioHostPort } from "./studioPorts.js";
import { GraphBuilderTab } from "./GraphBuilderTab.js";
import { MarketplaceTab } from "./MarketplaceTab.js";
import { LaunchTab } from "./LaunchTab.js";
import { AppsTab } from "./AppsTab.js";
import "./studio.css";

type StudioTab = "graph" | "marketplace" | "launch" | "apps";

const TABS: readonly [StudioTab, string][] = [
  ["graph", "Graph builder"],
  ["marketplace", "Marketplace"],
  ["launch", "Feed launch"],
  ["apps", "Attached apps"],
];

export function TransformStudio({ host }: { host: TransformStudioHostPort }) {
  const [tab, setTab] = useState<StudioTab>("graph");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="studio-panel" aria-label="Transform Studio">
      <header className="studio-header">
        <h1>Transform Studio</h1>
        <p className="studio-subtitle">
          Compose pipelines, review marketplace listings, launch feeds with approved
          pipelines, and manage attached applications.
        </p>
        <span className={`studio-evidence studio-evidence-${host.evidence}`}>
          {host.evidence === "real" ? "REAL HOST" : "FIXTURE HOST (browser demo)"}
        </span>
      </header>
      {error !== null ? <p className="studio-error">{error}</p> : null}
      <nav className="studio-tabs" aria-label="Studio sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "studio-tab studio-tab-active" : "studio-tab"}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "graph" ? <GraphBuilderTab host={host} onError={setError} /> : null}
      {tab === "marketplace" ? <MarketplaceTab host={host} onError={setError} /> : null}
      {tab === "launch" ? <LaunchTab host={host} onError={setError} /> : null}
      {tab === "apps" ? <AppsTab host={host} onError={setError} /> : null}
    </section>
  );
}
