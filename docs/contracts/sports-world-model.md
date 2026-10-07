# Sports World Model Contract

## Purpose

Represent authoritative structured state of an authorized sporting event independently of model, renderer and provider.

## Pipeline

authorized source -> acquisition -> normalization -> perception -> tracking -> calibration -> event reconstruction -> SWM

## Domains

source/media manifest, timestamps, entities, player/team identity, ball state, camera model, venue geometry, events, possession, confidence, uncertainty, provenance and rights.

## Invariants

- Production SWM is evidence-backed.
- Lab simulation never becomes production truth.
- Observations retain provenance.
- Uncertainty is carried.
- Renderers consume SWM through adapters.
- External tools may propose observations but cannot silently mutate canonical SWM.
- Additional sports and non-sport event domains must be possible without redesigning WorkGraph or Organizations.
