/**
 * Pure search primitives shared by Absolute and GAML.
 *
 * No Node.js or browser APIs are used here. Dates in search states are ISO
 * YYYY-MM-DD strings so states remain serialisable and deterministic.
 */
export const SEARCH_EPSILON = 0.001;

export function roundSearchMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function makeBalanceState(balances) {
  const entries = balances instanceof Map ? [...balances] : Object.entries(balances);
  return entries
    .map(([id, amount]) => [String(id), roundSearchMoney(amount)])
    .sort(([a], [b]) => a.localeCompare(b));
}

export function setSearchBalance(state, accountId, amount) {
  const id = String(accountId);
  return state.map(([key, value]) =>
    key === id ? [key, roundSearchMoney(amount)] : [key, value]
  );
}

export function addSearchBalance(state, accountId, delta) {
  const id = String(accountId);
  return state.map(([key, value]) =>
    key === id ? [key, roundSearchMoney(value + delta)] : [key, value]
  );
}

/** Set several account balances in one pass while preserving canonical order. */
export function zeroSearchBalances(state, accountIds) {
  if (!accountIds?.length) return state;
  const ids = new Set(accountIds.map(String));
  return state.map(([key, value]) => ids.has(key) ? [key, 0] : [key, value]);
}

export function mergePendingFlows(existing, additions) {
  if (!additions?.length) return existing;
  const grouped = new Map();
  for (const [date, accountId, amount] of additions) {
    const key = String(date);
    if (!grouped.has(key)) grouped.set(key, new Map());
    const byAccount = grouped.get(key);
    const id = String(accountId);
    byAccount.set(id, (byAccount.get(id) || 0) + Number(amount));
  }
  for (const [date, entries] of existing || []) {
    if (!grouped.has(String(date))) grouped.set(String(date), new Map());
    const target = grouped.get(String(date));
    for (const [id, amount] of entries) target.set(id, (target.get(id) || 0) + amount);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => [
      date,
      [...entries.entries()]
        .map(([id, amount]) => [id, roundSearchMoney(amount)])
        .sort(([a], [b]) => a.localeCompare(b)),
    ]);
}

/**
 * Prune only products with identical payout mechanics. Different payout
 * timing is material because intermediate cash flows can satisfy outflows.
 * Standard and eFD products remain separate so equivalent eFD preference is
 * handled as a tie-break rather than by deleting either product.
 */
export function pruneDominatedOptions(options) {
  const groups = new Map();
  for (const option of options) {
    const key = JSON.stringify([
      option.bank_identity || option.bank_id || option.bank_key || "",
      Boolean(option.is_efd),
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(option);
  }
  const retained = [];
  for (const group of groups.values()) {
    for (const candidate of group) {
      const dominated = group.some(other => {
        if (other === candidate) return false;
        const sameCashFlowShape =
          other.payout_type === candidate.payout_type &&
          (other.payout_period_str || "") === (candidate.payout_period_str || "");
        if (!sameCashFlowShape) return false;
        const noWorse =
          Number(other.days) <= Number(candidate.days) &&
          Number(other.annual_rate) >= Number(candidate.annual_rate) &&
          Number(other.min_amount) <= Number(candidate.min_amount);
        const strictlyBetter =
          Number(other.days) < Number(candidate.days) ||
          Number(other.annual_rate) > Number(candidate.annual_rate) ||
          Number(other.min_amount) < Number(candidate.min_amount);
        return noWorse && strictlyBetter;
      });
      if (!dominated) retained.push(candidate);
    }
  }
  return retained;
}

export function equivalentEfdCount(bookings, optionsByAccount) {
  let count = 0;
  for (const booking of bookings) {
    const { account_id, option } = booking;
    if (!option?.is_efd) continue;
    const options = optionsByAccount instanceof Map
      ? optionsByAccount.get(account_id) || []
      : optionsByAccount?.[account_id] || [];
    if (options.some(candidate =>
      !candidate.is_efd &&
      candidate.economic_terms_key === option.economic_terms_key
    )) count++;
  }
  return count;
}

/** Stable descending score ordering, with equivalent eFD as a tie-break. */
export function compareSearchCandidates(a, b) {
  const score = Number(b.score) - Number(a.score);
  if (Math.abs(score) > 1e-9) return score;
  const efd = Number(b.equivalent_efd_count || 0) - Number(a.equivalent_efd_count || 0);
  if (efd) return efd;
  return Number(a.sequence || 0) - Number(b.sequence || 0);
}

/**
 * Keep at least one strong representative for each root decision, reserving
 * roughly one third of the beam for diversity, then fill by global score.
 */
export function selectDiverseBeam(candidates, width) {
  if (!Number.isInteger(width) || width < 1) {
    throw new RangeError("Beam width must be a positive integer.");
  }
  const sorted = [...candidates].sort(compareSearchCandidates);
  const bestByRoot = new Map();
  for (const candidate of sorted) {
    const root = JSON.stringify(candidate.root_signature ?? ["unclassified"]);
    if (!bestByRoot.has(root)) bestByRoot.set(root, candidate);
  }
  const diversityCount = Math.min(width, Math.max(1, Math.floor(width / 3)));
  const selected = [];
  const seen = new Set();
  for (const candidate of [...bestByRoot.values()].sort(compareSearchCandidates).slice(0, diversityCount)) {
    const key = candidate.state_key ?? candidate;
    if (!seen.has(key)) {
      selected.push(candidate);
      seen.add(key);
    }
  }
  for (const candidate of sorted) {
    if (selected.length >= width) break;
    const key = candidate.state_key ?? candidate;
    if (!seen.has(key)) {
      selected.push(candidate);
      seen.add(key);
    }
  }
  return selected;
}

export class SearchTreeNode {
  constructor({ parent = null, action = null, date, root_signature = null }) {
    this.parent = parent;
    this.action = action;
    this.date = String(date);
    this.root_signature = root_signature ?? parent?.root_signature ?? null;
  }

  getPath() {
    const path = [];
    for (let node = this; node && node.action; node = node.parent) {
      path.push({ date: node.date, action: node.action });
    }
    return path.reverse();
  }
}
