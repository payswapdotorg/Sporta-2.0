/** Typed Lab domain errors. */

/** The population kind is not part of the closed LabPopulationKind union. */
export class LabPopulationKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabPopulationKindError";
  }
}

/** The WorkGraph to replay does not exist. */
export class LabWorkGraphNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabWorkGraphNotFoundError";
  }
}
