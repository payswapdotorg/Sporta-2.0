/**
 * sporta-product control primitives (W11A-1, SPEC.md §3) — a small set
 * of unbranded reusable controls that consume ONLY the sporta tokens
 * (theme.css, scoped to `.sporta-app`). No ZCode UI components, no
 * theme classes from another app, no external UI framework — the
 * product-vs-substrate boundary law.
 *
 * EVIDENCE CLASS (the SportaPanel precedent): BUILD-VERIFIED via
 * `pnpm exec tsc -b packages/web`; the pure derivations these controls
 * present are node-tested (homeModel/navigation); no browser harness
 * run is claimed in this lane.
 */
import type { ReactNode } from "react";

/** Honest evidence-grade vocabulary union (all seam grades, verbatim). */
export type SportaGradeLabel = "real" | "real-local" | "fixture" | "measured" | "declared";

/** Stable unique ids for aria-describedby reason links (no crypto dependency). */
let nextReasonId = 0;

const CHIP_CLASS: Record<SportaGradeLabel, string> = {
  real: "sporta-chip-real",
  "real-local": "sporta-chip-real-local",
  fixture: "sporta-chip-fixture",
  measured: "sporta-chip-measured",
  declared: "sporta-chip-declared",
};

/**
 * SportaButton — variants primary/secondary/ghost. UI-06 law: a control
 * disabled WITH a reason renders the reason visibly beside the control
 * (and links it via aria-describedby) — never a silent no-op.
 */
export function SportaButton(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  /** When set, the button is disabled AND the reason is shown visibly. */
  disabledReason?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
}) {
  const { children, onClick, variant = "secondary", disabled, disabledReason, type = "button" } = props;
  const variantClass =
    variant === "primary" ? "sporta-button sporta-button-primary"
    : variant === "ghost" ? "sporta-button sporta-button-ghost"
    : "sporta-button";
  const reasonId = disabledReason === undefined ? undefined : `sporta-reason-${(nextReasonId += 1)}`;
  if (reasonId === undefined) {
    return (
      <button type={type} className={variantClass} disabled={disabled === true} onClick={onClick} aria-label={props["aria-label"]}>
        {children}
      </button>
    );
  }
  return (
    <span className="sporta-control">
      <button
        type={type}
        className={variantClass}
        disabled
        aria-describedby={reasonId}
        aria-label={props["aria-label"]}
      >
        {children}
      </button>
      <span id={reasonId} className="sporta-button-reason">
        {disabledReason}
      </span>
    </span>
  );
}

/** SportaPanelCard — a titled surface section (section + heading semantics). */
export function SportaPanelCard(props: {
  heading: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={props.className === undefined ? "sporta-card" : `sporta-card ${props.className}`}>
      <div className="sporta-card-actions-row">
        <h2 className="sporta-card-heading">{props.heading}</h2>
        {props.actions === undefined ? null : <div className="sporta-card-actions">{props.actions}</div>}
      </div>
      {props.subtitle === undefined ? null : <p className="sporta-card-subtitle">{props.subtitle}</p>}
      {props.children}
    </section>
  );
}

/**
 * SportaStatusChip — the honest evidence/status label: the grade string
 * renders VERBATIM (uppercased for display), and fixture grades use a
 * dashed border so the grade is never color-alone (UI-15/UI-18).
 */
export function SportaStatusChip(props: { grade: SportaGradeLabel; label?: string }) {
  return (
    <span className={`sporta-chip ${CHIP_CLASS[props.grade]}`} data-grade={props.grade}>
      {props.label ?? props.grade}
    </span>
  );
}

/** SportaNavItem — a nav button; the active item carries aria-current. */
export function SportaNavItem(props: {
  navLabel: string;
  purpose?: string;
  active: boolean;
  onSelect: () => void;
}) {
  const className = props.active ? "sporta-nav-item sporta-nav-item-active" : "sporta-nav-item";
  return (
    <button
      type="button"
      className={className}
      aria-current={props.active ? "page" : undefined}
      onClick={props.onSelect}
    >
      <span className="sporta-nav-item-label">{props.navLabel}</span>
      {props.active && props.purpose !== undefined ? (
        <span className="sporta-nav-item-purpose">{props.purpose}</span>
      ) : null}
    </button>
  );
}

/** SportaEmptyState — a titled empty/missing block with hint + action. */
export function SportaEmptyState(props: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="sporta-empty">
      <p className="sporta-empty-title">{props.title}</p>
      {props.hint === undefined ? null : <p className="sporta-empty-hint">{props.hint}</p>}
      {props.action === undefined ? null : props.action}
    </div>
  );
}
