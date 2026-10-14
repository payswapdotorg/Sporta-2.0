/**
 * sporta-product shell (W11A-2, SPEC.md §4.4) — the Sporta-native
 * product shell: the top-level product navigation across the 7
 * registered screens (home/studio/marketplace/my-pipelines/runs/
 * library/connected-apps), a content region mounting the registered
 * screen module, honest placeholders for screens Workers B/C have not
 * shipped yet, a typed-refusal banner (never a silent no-op), and a
 * responsive layout (desktop nav rail at >=1024px; mobile collapsing
 * nav below — keyboard operable, visible focus).
 *
 * The shell OWNS navigation + route state restoration through the
 * controller in navigation.ts (the FROZEN SportaProductShellPort behind
 * additive names); screens never mutate the URL directly.
 *
 * EVIDENCE CLASS (the SportaPanel precedent): BUILD-VERIFIED via
 * `pnpm exec tsc -b packages/web`; the navigation/refusal/restoration
 * semantics are node-tested through the real frozen contract
 * (packages/web/test/sportaProductShell.test.ts). No browser harness
 * run is claimed in this lane — the TL integration mounts this shell on
 * /sporta, after which Worker C's journey coverage applies.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SportaNavigationRefusal,
  SportaScreenId,
  SportaScreenRegistration,
  SportaVisualBreakpoint,
} from "./contract.js";
import { createSportaProductShell, type SportaShellPortWithSubscription } from "./navigation.js";
import { resolveSportaBreakpoint, SPORTA_DESKTOP_MIN_WIDTH } from "./theme.js";
import type { SportaScreenContext, SportaScreenModule } from "./screens.js";
import { SportaButton, SportaEmptyState, SportaNavItem } from "./controls.js";
import { SPORTA_HOME_SCREEN } from "./home/HomeScreen.js";
import type { SportaHostPort } from "../hostPorts.js";
import type { TransformStudioHostPort } from "../studio/studioPorts.js";
import "./theme.css";
import "./shell.css";

/** The default screen modules: Home (this lane). Workers B/C + TL add theirs. */
const DEFAULT_MODULES: readonly SportaScreenModule[] = [SPORTA_HOME_SCREEN];

export interface SportaProductShellProps {
  /** The EXISTING product host port (the state-owner law — Home reads it). */
  readonly host: SportaHostPort;
  /** The EXISTING studio host port when the mount provides one (optional). */
  readonly studio?: TransformStudioHostPort;
  /** Screen modules (default: Home only; unregistered screens get the honest placeholder). */
  readonly modules?: readonly SportaScreenModule[];
  /** Shell port override (default: the browser-URL-backed controller). */
  readonly shell?: SportaShellPortWithSubscription;
  /** Breakpoint override (default: viewport-detected). */
  readonly breakpoint?: SportaVisualBreakpoint;
}

/** Viewport-detected breakpoint (min-width 1024px => desktop). */
function useSportaBreakpoint(): SportaVisualBreakpoint {
  const [breakpoint, setBreakpoint] = useState<SportaVisualBreakpoint>(() =>
    resolveSportaBreakpoint(
      typeof window === "undefined" ? SPORTA_DESKTOP_MIN_WIDTH : window.innerWidth,
    ),
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(`(min-width: ${SPORTA_DESKTOP_MIN_WIDTH}px)`);
    const onChange = () => setBreakpoint(query.matches ? "desktop" : "mobile");
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return breakpoint;
}

/** The Sporta wordmark — Sporta's own mark, never ZCode branding (UI-02). */
function SportaWordmark() {
  return (
    <div className="sporta-wordmark">
      <span className="sporta-wordmark-mark" aria-hidden="true" />
      <span className="sporta-wordmark-text">SPORTA</span>
      <span className="sporta-sr-only"> Sporta — sports media production</span>
    </div>
  );
}

/** The typed-refusal banner: surfaced, dismissible, never hidden (UI-06). */
function SportaRefusalBanner(props: {
  refusal: SportaNavigationRefusal;
  onDismiss: () => void;
}) {
  return (
    <div className="sporta-refusal" role="alert">
      <p className="sporta-refusal-text">
        <strong>Couldn&rsquo;t open {props.refusal.screen}.</strong> {props.refusal.reason}
      </p>
      <button type="button" className="sporta-refusal-dismiss" onClick={props.onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

/**
 * The honest placeholder for a registered-but-unimplemented screen: the
 * shell never fakes content (SPEC.md §4.4).
 */
function SportaScreenNotAvailable(props: {
  registration: SportaScreenRegistration;
  onGoHome: () => void;
}) {
  const { registration } = props;
  return (
    <section className="sporta-card sporta-screen-unavailable" aria-label={`${registration.navLabel} (not yet available)`}>
      <h1 className="sporta-screen-title">{registration.navLabel}</h1>
      <p className="sporta-screen-purpose">{registration.purpose}</p>
      <SportaEmptyState
        title="Not yet available in this build"
        hint="This screen is not implemented yet — nothing here is simulated. It ships with an upcoming Sporta build."
        action={
          <SportaButton variant="primary" onClick={props.onGoHome}>
            Go to Home
          </SportaButton>
        }
      />
      <p className="sporta-screen-tech">screen: {registration.id}</p>
    </section>
  );
}

/** The Sporta-native product shell (SPEC.md §4.4). */
export function SportaProductShell(props: SportaProductShellProps) {
  const shell = useMemo(
    () => props.shell ?? createSportaProductShell(),
    [props.shell],
  );
  const modules = props.modules ?? DEFAULT_MODULES;
  const registrations = shell.registrations();
  const detected = useSportaBreakpoint();
  const breakpoint = props.breakpoint ?? detected;

  const [route, setRoute] = useState(() => shell.currentRoute());
  const [refusal, setRefusal] = useState(() => shell.lastRefusal());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    return shell.subscribe((next) => {
      setRoute(next);
      setRefusal(shell.lastRefusal());
    });
  }, [shell]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const registration = registrations.find((item) => item.id === route.screen);
    document.title = `Sporta — ${registration?.navLabel ?? "Home"}`;
  }, [registrations, route]);

  const navigateTo = useCallback(
    (screen: SportaScreenId, focus?: string) => {
      const target = focus === undefined ? { screen } : { screen, focus };
      void shell.navigate(target).then((result) => {
        if (result.ok) setNavOpen(false);
      });
    },
    [shell],
  );

  const registration = registrations.find((item) => item.id === route.screen);
  const module = modules.find((item) => item.screen === route.screen);
  const context = useMemo<SportaScreenContext>(
    () => ({
      route,
      shell,
      host: props.host,
      ...(props.studio === undefined ? {} : { studio: props.studio }),
      breakpoint,
    }),
    [route, shell, props.host, props.studio, breakpoint],
  );

  const navItems = registrations.map((item) => (
    <SportaNavItem
      key={item.id}
      navLabel={item.navLabel}
      purpose={item.purpose}
      active={item.id === route.screen}
      onSelect={() => navigateTo(item.id)}
    />
  ));

  return (
    <div className="sporta-app">
      <a className="sporta-skip-link" href="#sporta-content">
        Skip to content
      </a>
      <div
        className={
          breakpoint === "desktop"
            ? "sporta-shell sporta-shell-desktop"
            : "sporta-shell sporta-shell-mobile"
        }
      >
        {breakpoint === "desktop" ? (
          <nav className="sporta-nav-rail" aria-label="Product sections">
            <SportaWordmark />
            {navItems}
          </nav>
        ) : (
          <header className="sporta-mobile-topbar">
            <SportaWordmark />
            <button
              type="button"
              className="sporta-menu-toggle"
              aria-expanded={navOpen}
              aria-controls="sporta-mobile-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              {navOpen ? "Close menu" : "Menu"}
            </button>
          </header>
        )}
        <div className="sporta-shell-body">
          {breakpoint === "mobile" && navOpen ? (
            <nav
              id="sporta-mobile-nav"
              className="sporta-mobile-nav"
              aria-label="Product sections"
              onKeyDown={(event) => {
                if (event.key === "Escape") setNavOpen(false);
              }}
            >
              {navItems}
            </nav>
          ) : null}
          <main id="sporta-content" className="sporta-content" tabIndex={-1}>
            {refusal !== null ? (
              <SportaRefusalBanner refusal={refusal} onDismiss={() => setRefusal(null)} />
            ) : null}
            {module !== undefined ? (
              module.render(context)
            ) : (
              <SportaScreenNotAvailable
                registration={
                  registration ?? {
                    id: route.screen,
                    navLabel: route.screen,
                    purpose: "",
                  }
                }
                onGoHome={() => navigateTo("home")}
              />
            )}
          </main>
          <footer className="sporta-footer">
            <span>Sporta · Sports media production suite</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
