const PRIORITY = { strict: 0, defer: 1, best_effort: 2 };

export function processOutflows(today, balances, pending, dueEntries) {
  const amounts = new Map(balances);
  const obligations = [
    ...pending,
    ...dueEntries.map(entry => [String(entry.name ?? "Outflow"), String(entry.account_id), round2(Number(entry.amount)), String(entry.payment_policy ?? "strict").toLowerCase(), today])
  ];
  obligations.sort((a, b) => (PRIORITY[a[3]] ?? 3) - (PRIORITY[b[3]] ?? 3) || String(a[4]).localeCompare(String(b[4])) || a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const remaining = [];
  let paidTotal = 0;
  for (const [name, accountId, required, policy, dueDate] of obligations) {
    if (!amounts.has(accountId)) throw new RangeError(`Outflow ${name} targets unknown account ${accountId}.`);
    const available = Math.max(0, amounts.get(accountId));
    let paid;
    if (policy === "strict") {
      if (available + 0.001 < required) return { balances, pending: obligations, paid: paidTotal, valid: false };
      paid = required;
    } else if (policy === "defer") {
      if (available + 0.001 < required) { remaining.push([name, accountId, required, policy, dueDate]); continue; }
      paid = required;
    } else if (policy === "best_effort") paid = Math.min(available, required);
    else throw new RangeError(`Unknown outflow payment policy: ${policy}`);
    amounts.set(accountId, round2(available - paid));
    paidTotal += paid;
    const unpaid = round2(required - paid);
    if (unpaid > 0.001) remaining.push([name, accountId, unpaid, policy, dueDate]);
  }
  return { balances: [...amounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, amount]) => [id, round2(amount)]), pending: remaining, paid: round2(paidTotal), valid: true };
}

export function validateOutflowSchedule(schedule, start, end, accountIds) {
  for (const [day, entries] of Object.entries(schedule)) {
    if (day < start || day > end) throw new RangeError(`Outflow date ${day} is outside the investment period.`);
    if (!Array.isArray(entries)) throw new TypeError(`Outflow schedule entry for ${day} must be an array.`);
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object") throw new TypeError(`Outflow ${day} at index ${index} must be an object.`);
      if (!accountIds.has(String(entry.account_id ?? "").trim())) throw new RangeError(`Outflow targets unknown account ${entry.account_id}.`);
      if (!Number.isFinite(Number(entry.amount)) || Number(entry.amount) <= 0) throw new RangeError(`Outflow on ${day} amount must be finite and greater than zero.`);
      const policy = String(entry.payment_policy ?? "strict").toLowerCase();
      if (!["strict", "defer", "best_effort"].includes(policy)) throw new RangeError(`Invalid outflow payment policy ${policy}.`);
    }
  }
}

function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
