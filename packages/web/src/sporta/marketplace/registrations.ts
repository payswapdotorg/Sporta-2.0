/**
 * W11C screen registrations — the frozen `SportaScreenRegistration`
 * contract (packages/web/src/sporta/product/contract.ts, TL Wave 0).
 *
 * Worker A's shell is NOT present at this base SHA (product/ carries only
 * the frozen contract + SCREEN-PORTS.md), so registration is COMPILE-TIME
 * against the frozen type; the TL integration consumes these constants
 * in registration order. Ids are the closed-vocabulary screen ids and
 * are validated against `validateSportaScreenRoute` in the node battery.
 */
import type { SportaScreenRegistration } from "../product/contract.js";

/** "marketplace" — browse approved transform pipelines (public side). */
export const MARKETPLACE_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "marketplace",
  navLabel: "Marketplace",
  purpose: "Browse approved transform pipelines, review status and launch terms.",
};

/** "my-pipelines" — the creator side of the same marketplace records. */
export const MY_PIPELINES_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "my-pipelines",
  navLabel: "My Pipelines",
  purpose: "Track your drafts, submissions, review feedback and released versions.",
};

/** The lane's registrations in product nav order. */
export const MARKETPLACE_LANE_REGISTRATIONS: readonly SportaScreenRegistration[] = [
  MARKETPLACE_SCREEN_REGISTRATION,
  MY_PIPELINES_SCREEN_REGISTRATION,
];
