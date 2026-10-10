import type { Confidence, Iso8601, SportaId } from "@sporta/contracts/contract";
/**
 * The play-by-play phrasing engine (domain layer — pure, no IO).
 *
 * RULE-BASED and DOMAIN-AGNOSTIC: a fixed ordered rule set over
 * record-derived facts only. NO ML claims — no model is loaded or
 * executed, nothing is learned; the vocabulary is deliberately
 * generic (event, sequence, domain, capture time, confidence) so a
 * new sport or non-sport event domain renders unchanged (the domain
 * extension law). Every phrase carries the event id it derives from
 * and the record fields its text was built from — zero invented
 * facts.
 */

/** The record-derived facts one event contributes to the narrative. */
export interface NarrativeEventFacts {
  readonly eventId: SportaId;
  /** 0-based index of the event id in `snapshot.events`. */
  readonly sequence: number;
  /** Total number of events in the snapshot. */
  readonly total: number;
  readonly domain: string;
  /** The snapshot capture anchor (the only wall-clock the record carries). */
  readonly capturedAt: Iso8601;
  /** Attached confidence (only when an uncertainty subject matches). */
  readonly confidence?: Confidence;
}

/** One generated phrase of the narrative. */
export interface PlayByPlayPhrase {
  /** The generated, deterministic text. */
  readonly text: string;
  /** Which rule produced the phrase. */
  readonly templateId: NarrativeTemplateId;
  /** The event id the phrase derives from (traceability). */
  readonly anchoredEventId: SportaId;
  /** The snapshot fields the text was built from. */
  readonly derivedFields: readonly string[];
}

/** The fixed, ordered rule vocabulary of the engine. */
export type NarrativeTemplateId = "event-sequence" | "event-anchor" | "event-confidence";

/** One rule: applies to facts, then renders deterministic text. */
interface NarrativeRule {
  readonly templateId: NarrativeTemplateId;
  applies(facts: NarrativeEventFacts): boolean;
  render(facts: NarrativeEventFacts): string;
  readonly derivedFields: readonly string[];
}

const RULES: readonly NarrativeRule[] = [
  {
    templateId: "event-sequence",
    applies: () => true,
    render: (facts) =>
      `Event ${facts.eventId} recorded at sequence ${String(facts.sequence + 1)} of ${String(facts.total)} in domain ${facts.domain}.`,
    derivedFields: ["events", "domain"],
  },
  {
    templateId: "event-anchor",
    applies: () => true,
    render: (facts) =>
      `Event ${facts.eventId} is anchored to the snapshot capture time ${facts.capturedAt} (snapshot provenance; per-event timestamps are not carried by the world model).`,
    derivedFields: ["provenance.capturedAt"],
  },
  {
    templateId: "event-confidence",
    applies: (facts) => facts.confidence !== undefined,
    render: (facts) =>
      `Event ${facts.eventId} carries recorded confidence ${String(facts.confidence)}.`,
    derivedFields: ["uncertainty"],
  },
];

/**
 * The phrasing engine entrypoint: applies the ordered rule set to one
 * event's facts and returns the applicable phrases (deterministic —
 * same facts, same phrases, byte-identical).
 */
export function phraseEvent(facts: NarrativeEventFacts): readonly PlayByPlayPhrase[] {
  const phrases: PlayByPlayPhrase[] = [];
  for (const rule of RULES) {
    if (!rule.applies(facts)) continue;
    phrases.push({
      text: rule.render(facts),
      templateId: rule.templateId,
      anchoredEventId: facts.eventId,
      derivedFields: [...rule.derivedFields],
    });
  }
  return phrases;
}
