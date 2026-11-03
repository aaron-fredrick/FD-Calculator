import { SearchStrategyBase } from "./search-strategy-base.js";

/**
 * Bounded layered beam-search optimiser.
 *
 * Settings mirror the Python GAML implementation:
 * - beam_width: retained frontier states per layer (default 256)
 * - max_local_branches: top partial local-booking combinations (default 128; null = exhaustive)
 * - max_decisions: optional hard expanded-state budget (default unlimited)
 */
export class GAMLStrategy extends SearchStrategyBase {
  static name = "GAML";
  constructor(settings = {}) {
    super(settings, "gaml");
  }
}
