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

export interface SportaProductAppProps {
  /** The EXISTING product host port (the state-owner law). */
  readonly host: SportaHostPort;
  /** The EXISTING studio host port (the Studio seam). */
  readonly studio: TransformStudioHostPort;
  /** Shell port override (tests/SSR); default: the browser-URL-backed shell. */
  readonly shell?: SportaShellPortWithSubscription;
}

/** The full W11 screen set — the seven closed registrations, all mounted. */
export function useSportaProductScreenModules(
  studio: TransformStudioHostPort,
): readonly SportaScreenModule[] {
  return useMemo<readonly SportaScreenModule[]>(() => {
    const marketplaceHosts = createMarketplaceScreenHost(studio);
    const runsPort = createRunsFixtureHost();
    const libraryPort = createLibraryFixtureHost();
    const appsPort = createAppsFixtureHost();
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
        render: () => <MyPipelinesScreen port={marketplaceHosts.myPipelines} />,
      },
      { screen: "runs", render: () => <RunsScreen port={runsPort} /> },
      { screen: "library", render: () => <LibraryScreen port={libraryPort} /> },
      { screen: "connected-apps", render: () => <ConnectedAppsScreen port={appsPort} /> },
    ];
  }, [studio]);
}

/** The Sporta-native product app: shell + every screen (W11 final wiring). */
export function SportaProductApp({ host, studio, shell }: SportaProductAppProps) {
  const modules = useSportaProductScreenModules(studio);
  return <SportaProductShell host={host} studio={studio} modules={modules} shell={shell} />;
}
