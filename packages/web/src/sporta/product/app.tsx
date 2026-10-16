/**
 * SportaProductApp — the W11 TL integration mount (the wave's final wiring).
 *
 * Mounts the W11A product shell with the FULL screen set through the
 * constructor-injection contract (the state-owner law, SCREEN-PORTS.md):
 *   - Home (W11A) — the default screen module.
 *   - Studio (W11B) — the workbench, rendered with the shell port so its
 *     in-studio navigation goes through the SAME shell law as everything
 *     else (never the URL directly).
 *   - Marketplace + My Pipelines (W11C) — through the marketplace screen
 *     host over the EXISTING studio seam reads (the studio host's own
 *     evidence badge carries; in the browser mount that is the labeled
 *     studio fixture composition — never re-badged here).
 *   - Runs / Library / Connected Apps (W11C) — through their labeled
 *     browser fixture hosts (the composition-side read seams are the
 *     worker's serialized NEXT DEPENDENCIES; until they land, the screens
 *     surface the honest missing-seam notes themselves).
 *
 * The /sporta entrypoint (main.tsx) renders this app; the pre-W11
 * SportaPanel trace projection is superseded (its consent/takeover write
 * paths and stage projection live on in the Home screen through the same
 * host port).
 */
import { useMemo } from "react";
import { SportaProductShell } from "./shell.js";
import { SPORTA_HOME_SCREEN } from "./home/HomeScreen.js";
import type { SportaScreenModule } from "./screens.js";
import type { SportaShellPortWithSubscription } from "./navigation.js";
import { TransformStudio } from "../studio/TransformStudio.js";
import { MarketplaceScreen } from "../marketplace/MarketplaceScreen.js";
import { MyPipelinesScreen } from "../marketplace/MyPipelinesScreen.js";
import { createMarketplaceScreenHost } from "../marketplace/marketplaceScreenHost.js";
import { RunsScreen } from "../runs/RunsScreen.js";
import { createRunsFixtureHost } from "../runs/runsFixtureHost.js";
import { LibraryScreen } from "../library/LibraryScreen.js";
import { createLibraryFixtureHost } from "../library/libraryFixtureHost.js";
import { ConnectedAppsScreen } from "../apps/ConnectedAppsScreen.js";
import { createAppsFixtureHost } from "../apps/appsFixtureHost.js";
import type { SportaHostPort } from "../hostPorts.js";
import type { TransformStudioHostPort } from "../studio/studioPorts.js";
import type { RunsRealHost } from "../runs/runsRealHost.js";
import type { LibraryRealHost } from "../library/libraryRealHost.js";
import type { MyPipelinesRealHost } from "../marketplace/myPipelinesRealHost.js";
import type { AppsRealHost } from "../apps/appsRealHost.js";

/**
 * The W12-D REAL screen ports (constructor injection — the state-owner
 * law): a headless caller (the productComposition root) supplies the
 * lanes' REAL hosts; the browser mount supplies NOTHING and keeps the
 * labeled fixture hosts with their honest missing-seam notes. Present
 * = REAL backing badges + the retired missing-seam notes (REAL records
 * replace the empty states that carry them).
 */
export interface SportaRealScreenPorts {
  /** The W12-A runs REAL host (gradeNote carries the ledger honesty label). */
  readonly runs: RunsRealHost;
  /** The W12-A library REAL host. */
  readonly library: LibraryRealHost;
  /** The W12-B my-pipelines REAL host (submission states). */
  readonly myPipelines: MyPipelinesRealHost;
  /** The W12-C connected-apps REAL host (audit + revoke write). */
  readonly connectedApps: AppsRealHost;
}

export interface SportaProductAppProps {
  /** The EXISTING product host port (the state-owner law). */
  readonly host: SportaHostPort;
  /** The EXISTING studio host port (the Studio seam). */
  readonly studio: TransformStudioHostPort;
  /** Shell port override (tests/SSR); default: the browser-URL-backed shell. */
  readonly shell?: SportaShellPortWithSubscription;
  /**
   * The W12-D REAL screen ports — ABSENT = the browser demo fixture hosts
   * (honest labels unchanged); PRESENT = the lanes' REAL hosts (the
   * productComposition root supplies them). Never a mix per screen: each
   * slot is either the REAL host or its labeled fixture sibling.
   */
  readonly realScreenPorts?: SportaRealScreenPorts;
}

/** The full W11 screen set — the seven closed registrations, all mounted. */
export function useSportaProductScreenModules(
  studio: TransformStudioHostPort,
  realScreenPorts?: SportaRealScreenPorts,
): readonly SportaScreenModule[] {
  return useMemo<readonly SportaScreenModule[]>(() => {
    const marketplaceHosts = createMarketplaceScreenHost(studio);
    // W12-D: each slot is the REAL host when the caller injected it,
    // else the labeled browser fixture (never a mix per screen).
    const runsPort = realScreenPorts?.runs ?? createRunsFixtureHost();
    const libraryPort = realScreenPorts?.library ?? createLibraryFixtureHost();
    const myPipelinesPort = realScreenPorts?.myPipelines ?? marketplaceHosts.myPipelines;
    const appsPort = realScreenPorts?.connectedApps ?? createAppsFixtureHost();
    return [
      SPORTA_HOME_SCREEN,
      {
        screen: "studio",
        render: (context) => <TransformStudio host={studio} shell={context.shell} />,
      },
      {
        screen: "marketplace",
        render: () => <MarketplaceScreen port={marketplaceHosts.marketplace} />,
      },
      {
        screen: "my-pipelines",
        render: () => <MyPipelinesScreen port={myPipelinesPort} />,
      },
      { screen: "runs", render: () => <RunsScreen port={runsPort} /> },
      { screen: "library", render: () => <LibraryScreen port={libraryPort} /> },
      { screen: "connected-apps", render: () => <ConnectedAppsScreen port={appsPort} /> },
    ];
  }, [studio, realScreenPorts]);
}

/** The Sporta-native product app: shell + every screen (W11 final wiring). */
export function SportaProductApp({ host, studio, shell, realScreenPorts }: SportaProductAppProps) {
  const modules = useSportaProductScreenModules(studio, realScreenPorts);
  return <SportaProductShell host={host} studio={studio} modules={modules} shell={shell} />;
}
