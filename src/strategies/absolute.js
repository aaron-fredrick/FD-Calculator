import { SearchStrategyBase } from "./search-strategy-base.js";

/** Exhaustive branch-and-bound portfolio optimiser. */
export class AbsoluteStrategy extends SearchStrategyBase {
  static name = "Absolute";
  constructor(settings = {}) {
    super(settings, "absolute");
  }
}
