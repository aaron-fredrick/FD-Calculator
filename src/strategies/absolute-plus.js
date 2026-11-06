import { SearchStrategyBase } from "./search-strategy-base.js";

/**
 * Bounded search optimiser.
 *
 * Settings expose the bounded-search controls used by Absolute+:
 * - beam_width: retained frontier states per layer (default 256)
 * - max_local_branches: top partial local-booking combinations (default 128; null = exhaustive)
 * - max_decisions: optional hard expanded-state budget (default unlimited)
 */
export class AbsolutePlusStrategy extends SearchStrategyBase {
  constructor(settings = {}) {
    super(settings, "gaml");
  }
}

// Keep the historical export name for existing imports; the public strategy name is Absolute R+.
export const GAMLStrategy = AbsolutePlusStrategy;
