/**
 * TransformStudio — the studio root render surface (W11B workbench).
 *
 * W11B-1: the narrow/tab-only W9C presentation is REPLACED by the
 * feed-to-output workbench: source rail | main work area (pipeline
 * picker + graph) | stage context (preview / launch / status +
 * summaries). Desktop reads left-to-right through the flow; mobile
 * stacks in flow order with no horizontal overflow (studio.css).
 *
 * EVIDENCE CLASS (the UI honesty law): BUILD-VERIFIED plus the
 * battery-tested pure view-models; the panel renders whatever the
 * injected `TransformStudioHostPort` reports — REAL legs when the
 * headless composition drives it, honestly-labeled FIXTURE in the
 * browser route. Grades and refusals flow VERBATIM; success is never
 * fabricated.
 *
 * Surface law (unchanged): read-only studio state + EXACTLY the
 * launch-selection write path. The W11B additions are the optional
 * live-evidence READ seam and the OPTIONAL shell port (navigation
 * belongs to Worker A's shell; the studio never mutates a URL).
 */
import { useCallback, useEffect, useState } from "react";
import { validateSportaScreenRoute } from "../product/contract.js";
import type {
  SportaNavigationRefusal,
  SportaProductShellPort,
  SportaScreenRoute,
} from "../product/contract.js";
import type {
  StudioAppAttachmentView,
  StudioListingView,
  StudioReviewStatus,
  StudioSamplePreviewView,
  StudioLiveSourceView,
  TransformStudioHostPort,
} from "./studioPorts.js";
import { projectDisclosure } from "./marketplaceViews.js";
import {
  beginLaunchSelection,
  cancelLaunchConfirmation,
  confirmLaunch,
  requestLaunchConfirmation,
  type StudioLaunchSelectionState,
} from "./launchSelection.js";
import {
  initialWorkbenchFlow,
  markWorkbenchLaunch,
  markWorkbenchPreview,
  selectWorkbenchListing,
  selectWorkbenchSource,
  workbenchProgress,
  workbenchLaunchReady,
  type WorkbenchFlowState,
} from "./workbench.js";
import { studioEvidenceGrade, STUDIO_LINK_ROUTES } from "./studioRegistration.js";
import { SourceRail } from "./SourceRail.js";
import { PipelinePicker } from "./PipelinePicker.js";
import { GraphPanel } from "./GraphPanel.js";
import { PreviewPanel } from "./PreviewPanel.js";
import { LaunchPanel } from "./LaunchPanel.js";
import { StatusPanel } from "./StatusPanel.js";
import { AppsSummary, MarketplaceSummary } from "./StudioSummaries.js";
import "./studio.css";
import "./studioWorkArea.css";
import "./studioContext.css";

function errText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function TransformStudio({
  host,
  shell,
}: {
  host: TransformStudioHostPort;
  shell?: SportaProductShellPort;
}) {
  const [flow, setFlow] = useState<WorkbenchFlowState>(initialWorkbenchFlow);
  const [listings, setListings] = useState<readonly StudioListingView[] | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [review, setReview] = useState<StudioReviewStatus | null>(null);
  const [preview, setPreview] = useState<StudioSamplePreviewView | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [apps, setApps] = useState<readonly StudioAppAttachmentView[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [liveSources, setLiveSources] = useState<readonly StudioLiveSourceView[] | "unavailable" | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [selection, setSelection] = useState<StudioLaunchSelectionState | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [navRefusal, setNavRefusal] = useState<SportaNavigationRefusal | null>(null);

  // Seam: listings + attached apps + (optional) live evidence.
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const loaded = await host.listListings();
        if (!disposed) {
          setListings(loaded);
          setListingsError(null);
        }
      } catch (cause) {
        if (!disposed) setListingsError(errText(cause));
      }
      try {
        const attached = await host.listAppAttachments();
        if (!disposed) {
          setApps(attached);
          setAppsError(null);
        }
      } catch (cause) {
        if (!disposed) setAppsError(errText(cause));
      } finally {
        if (!disposed) setAppsLoading(false);
      }
      if (host.readLiveSourceEvidence === undefined) {
        if (!disposed) {
          setLiveSources("unavailable"); // honest absence — never fabricated evidence
        }
        return;
      }
      try {
        const live = await host.readLiveSourceEvidence();
        if (!disposed) {
          setLiveSources(live);
          setLiveError(null);
        }
      } catch (cause) {
        if (!disposed) setLiveError(errText(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [host]);

  // Seam: review + sample preview for the selected pipeline.
  useEffect(() => {
    const listing = listings?.find((entry) => entry.listingId === flow.listingId) ?? null;
    if (listing === null) {
      setReview(null);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setFlow((current) => markWorkbenchPreview(current, false));
      return;
    }
    let disposed = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void (async () => {
      try {
        const [nextReview, nextPreview] = await Promise.all([
          host.readReviewStatus(listing.pipelineId, listing.approvedVersion),
          host.readSamplePreview(listing.pipelineId, listing.approvedVersion),
        ]);
        if (disposed) return;
        setReview(nextReview);
        setPreview(nextPreview);
        setFlow((current) => markWorkbenchPreview(current, nextPreview !== null));
      } catch (cause) {
        if (!disposed) setPreviewError(errText(cause));
      } finally {
        if (!disposed) setPreviewLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [host, listings, flow.listingId]);

  const selectedListing = listings?.find((entry) => entry.listingId === flow.listingId) ?? null;

  const handleSelectSource = useCallback(
    (source: Parameters<typeof selectWorkbenchSource>[1]) => {
      setFlow((current) => selectWorkbenchSource(current, source));
      setSelection(null); // a new source invalidates the launch context
      setLaunchError(null);
    },
    [],
  );

  const handleSelectListing = useCallback((listingId: string) => {
    setFlow((current) => selectWorkbenchListing(current, listingId));
    setSelection(null); // a new pipeline invalidates preview + launch context
    setLaunchError(null);
  }, []);

  const handleBeginLaunch = useCallback(async () => {
    if (selectedListing === null || flow.source === null) return;
    setLaunchBusy(true);
    setLaunchError(null);
    try {
      const disclosure = await host.readLaunchDisclosure(selectedListing.listingId);
      const next = beginLaunchSelection({
        feedKind: flow.source.feedKind,
        disclosure: projectDisclosure(disclosure),
      });
      setSelection(next);
      setFlow((current) => markWorkbenchLaunch(current, "disclosure"));
    } catch (cause) {
      setLaunchError(errText(cause)); // typed errors propagate, never fake disclosure
    } finally {
      setLaunchBusy(false);
    }
  }, [selectedListing, flow.source, host]);

  const handleConfirm = useCallback(async () => {
    if (selection === null || selection.stage !== "awaiting-confirmation") return;
    setLaunchBusy(true);
    setLaunchError(null);
    try {
      const admission = await host.selectForLaunch(selection.disclosure.listingId);
      const next = confirmLaunch(selection, admission); // typed result VERBATIM
      setSelection(next);
      setFlow((current) =>
        markWorkbenchLaunch(current, next.stage === "admitted" ? "admitted" : "refused"),
      );
    } catch (cause) {
      setLaunchError(errText(cause));
    } finally {
      setLaunchBusy(false);
    }
  }, [selection, host]);

  const handleNavigate = useCallback(
    async (index: number) => {
      if (shell === undefined) return;
      const link = STUDIO_LINK_ROUTES[index];
      if (link === undefined) return;
      const checked = validateSportaScreenRoute(link.route); // fail-closed; screens never guess ids
      if (!checked.ok) {
        setNavRefusal({ screen: link.route.screen, reason: checked.reason });
        return;
      }
      const route: SportaScreenRoute = link.route;
      const result = await shell.navigate(route);
      setNavRefusal(result.ok ? null : result.refusal); // a refusal renders as a refusal
    },
    [shell],
  );

  const progress = workbenchProgress(flow);
  const launchReady = workbenchLaunchReady(flow);

  return (
    <section className="studio-panel" aria-label="Transform Studio workbench">
      <header className="studio-header">
        <h1>Studio</h1>
        <p className="studio-subtitle">
          One flow: pick a feed source, choose an approved pipeline, inspect the graph, preview,
          launch with the full disclosure, and read the honest status and evidence.
        </p>
      </header>
      <div className="studio-workbench">
        <SourceRail
          flow={flow}
          progress={progress}
          liveSources={liveSources}
          liveState={liveSources === null ? "loading" : "loaded"}
          liveError={liveError}
          hostEvidence={host.evidence}
          screenGrade={studioEvidenceGrade(host.evidence)}
          shell={shell ?? null}
          navRefusal={navRefusal}
          onSelectSource={handleSelectSource}
          onNavigate={(index) => void handleNavigate(index)}
        />
        <div className="studio-main" aria-label="Pipeline work area">
          <section aria-label="Pipeline selection">
            <h2 className="studio-main-heading">1 · Pipeline</h2>
            <PipelinePicker
              listings={listings}
              loading={listings === null && listingsError === null}
              error={listingsError}
              selectedListingId={flow.listingId}
              onSelect={handleSelectListing}
            />
          </section>
          <h2 className="studio-main-heading">2 · Graph work area</h2>
          <GraphPanel host={host} />
        </div>
        <div className="studio-context" aria-label="Preview, launch and status context">
          <PreviewPanel
            listing={selectedListing}
            preview={preview}
            loading={previewLoading}
            error={previewError}
            review={review}
          />
          <LaunchPanel
            selection={selection}
            busy={launchBusy}
            loadError={launchError}
            canBegin={launchReady && selectedListing !== null}
            onBegin={() => void handleBeginLaunch()}
            onRequestConfirmation={() =>
              setSelection((current) =>
                current === null ? current : requestLaunchConfirmation(current),
              )
            }
            onConfirm={() => void handleConfirm()}
            onCancel={() =>
              setSelection((current) =>
                current === null ? current : cancelLaunchConfirmation(current),
              )
            }
          />
          <StatusPanel
            flow={flow}
            preview={preview}
            onOpenRuns={() => void handleNavigate(2)}
            onOpenLibrary={() => void handleNavigate(3)}
          />
          <MarketplaceSummary
            listings={listings ?? []}
            onOpenMarketplace={() => void handleNavigate(0)}
          />
          <AppsSummary
            apps={apps}
            appsLoading={appsLoading}
            appsError={appsError}
            onOpenConnectedApps={() => void handleNavigate(1)}
          />
        </div>
      </div>
    </section>
  );
}
