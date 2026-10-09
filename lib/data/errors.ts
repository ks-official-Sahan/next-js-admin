/**
 * A write hit a unique index, for example two people creating the same
 * version at once. Every implementation translates its driver's error into
 * this, so callers never check an ORM-specific code.
 */
export class UniqueViolation extends Error {
  constructor(message = "A row with the same unique value already exists.") {
    super(message);
    this.name = "UniqueViolation";
  }
}
