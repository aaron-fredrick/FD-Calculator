const COMPONENTS = ["principal", "uncredited_interest", "counted_interest"];
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
const empty = () => ({ principal: 0, uncredited_interest: 0, counted_interest: 0 });
const totalOf = value => COMPONENTS.reduce((sum, key) => sum + value[key], 0);

/**
 * Tracks the economic origin of cash independently of the account's displayed
 * balance. All mutations reconcile to cents; interest credited to consolidation
 * is moved into a permanent counted bucket and is never counted a second time.
 */
export class BalanceProvenance {
  constructor(accountIds = []) {
    this.accounts = new Map(accountIds.map(id => [String(id), empty()]));
    this.creditedNetInterest = 0;
  }

  #get(id) {
    const key = String(id);
    if (!this.accounts.has(key)) throw new RangeError("Unknown provenance account " + key + ".");
    return this.accounts.get(key);
  }

  #normalize(value) {
    const result = empty();
    for (const key of COMPONENTS) {
      const amount = Number(value?.[key] ?? 0);
      if (!Number.isFinite(amount) || amount < -0.001) throw new RangeError("Provenance components must be finite and non-negative.");
      result[key] = cents(Math.max(0, amount));
    }
    return result;
  }

  clone() { const copy = new BalanceProvenance([...this.accounts.keys()]); copy.accounts = new Map([...this.accounts].map(([id, value]) => [id, { ...value }])); copy.creditedNetInterest = this.creditedNetInterest; return copy; }\n\n  total(id) { return cents(totalOf(this.#get(id))); }

  snapshot(id) { return { ...this.#get(id) }; }

  add(id, components) {
    const target = this.#get(id);
    const addition = this.#normalize(components);
    for (const key of COMPONENTS) target[key] = cents(target[key] + addition[key]);
    return this.snapshot(id);
  }

  addPrincipal(id, amount) { return this.add(id, { principal: amount }); }

  /** Remove an amount pro rata; returns the exact component composition removed. */
  debit(id, amount) {
    const source = this.#get(id);
    const requested = cents(Number(amount));
    const total = totalOf(source);
    if (!Number.isFinite(requested) || requested < 0 || requested > total + 0.001) {
      throw new RangeError("Provenance debit exceeds the available balance.");
    }
    if (requested <= 0) return empty();
    if (total <= 0) throw new RangeError("Cannot debit an empty provenance balance.");
    const result = empty();
    let allocated = 0;
    COMPONENTS.forEach((key, index) => {
      const part = index === COMPONENTS.length - 1
        ? cents(requested - allocated)
        : cents(requested * source[key] / total);
      result[key] = Math.min(source[key], Math.max(0, part));
      allocated = cents(allocated + result[key]);
    });
    // Reconcile any rounding residual against the largest remaining component.
    let residual = cents(requested - totalOf(result));
    if (Math.abs(residual) >= 0.01) {
      const key = [...COMPONENTS].sort((a, b) => source[b] - result[b] - (source[a] - result[a]))[0];
      result[key] = cents(result[key] + residual);
    }
    for (const key of COMPONENTS) source[key] = cents(source[key] - result[key]);
    return result;
  }

  /**
   * Transfer a gross amount and allocate the fee proportionally across its
   * principal/interest provenance. The target receives gross less fee.
   */
  transfer(sourceId, targetId, grossAmount, fee = 0) {
    if (String(sourceId) === String(targetId)) throw new RangeError("Provenance transfer accounts must differ.");
    const gross = cents(Number(grossAmount)), charge = cents(Number(fee));
    if (!Number.isFinite(gross) || !Number.isFinite(charge) || charge < 0 || charge >= gross) {
      throw new RangeError("Transfer amount and fee are invalid.");
    }
    const moved = this.debit(sourceId, gross);
    const net = empty();
    const keys = COMPONENTS.filter(key => moved[key] > 0);
    let allocatedFee = 0;
    keys.forEach((key, index) => {
      const componentFee = index === keys.length - 1
        ? cents(charge - allocatedFee)
        : cents(charge * moved[key] / gross);
      net[key] = cents(moved[key] - componentFee);
      allocatedFee = cents(allocatedFee + componentFee);
    });
    this.add(targetId, net);
    return { gross: moved, fee: Object.fromEntries(COMPONENTS.map(key => [key, cents(moved[key] - net[key])])), net };
  }

  /** Move newly credited interest into the irreversible goal-accounted bucket. */
  recognizeConsolidationCredit(id) {
    const source = this.#get(id);
    const newlyCredited = source.uncredited_interest;
    source.uncredited_interest = 0;
    source.counted_interest = cents(source.counted_interest + newlyCredited);
    this.creditedNetInterest = cents(this.creditedNetInterest + newlyCredited);
    return cents(newlyCredited);
  }

  /** Allocate an FD principal return using the composition originally booked. */
  allocateBookedPrincipal(bookedComponents, principalAmount, bookedPrincipal) {
    const amount = cents(Number(principalAmount));
    const base = this.#normalize(bookedComponents);
    const total = cents(Number(bookedPrincipal));
    if (amount < 0 || amount > total + 0.001 || total <= 0) throw new RangeError("Invalid booked-principal return.");
    const result = empty();
    let allocated = 0;
    COMPONENTS.forEach((key, index) => {
      result[key] = index === COMPONENTS.length - 1
        ? cents(amount - allocated)
        : cents(amount * base[key] / total);
      allocated = cents(allocated + result[key]);
    });
    return result;
  }
}
