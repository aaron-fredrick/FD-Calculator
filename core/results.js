import { CUMULATIVE, PERIODIC_INTEREST } from "./models.js";
import { EventType } from "./events.js";

export class Booking {
  constructor({ option, principal, start, cash_flows, account_id = "", bank_key = "", bank_id = "" }) {
    if (!option) throw new TypeError("Booking requires an FD option.");
    if (!Number.isFinite(principal) || principal <= 0) throw new RangeError("Booking principal must be finite and positive.");
    if (!Array.isArray(cash_flows) || cash_flows.length === 0) throw new TypeError("Booking requires at least one cash flow.");
    this.option = option;
    this.principal = principal;
    this.start = new Date(start);
    this.cash_flows = cash_flows.map(flow => ({ date: new Date(flow.date), amount: Number(flow.amount) }));
    if (this.cash_flows.some(flow => !Number.isFinite(flow.amount))) throw new TypeError("Booking cash flows must be finite.");
    this.account_id = account_id;
    this.bank_key = bank_key;
    this.bank_id = bank_id;
  }
  get total_received() { return this.cash_flows.reduce((sum, flow) => sum + flow.amount, 0); }
  get total_interest() { return this.total_received - this.principal; }
  get end() { return new Date(Math.max(...this.cash_flows.map(flow => flow.date.getTime()))); }
  get payout_type() { return this.option.payout_type; }
}

export class SimResult {
  constructor({
    strategy_name, timeline = {}, bookings = [], total_principal = 0, end_date,
    accounts = {}, total_transfer_fees = 0, total_decisions_evaluated = null,
    alternative_leaf_net_interests = [], total_outflows_paid = 0,
    outstanding_outflows = [], valid = true, decision_log = [],
    ait_enabled = false, ait_rate = 0.10
  }) {
    this.strategy_name = strategy_name;
    this.timeline = timeline;
    this.bookings = bookings;
    this.total_principal = total_principal;
    this.end_date = new Date(end_date);
    this.accounts = accounts;
    this.total_transfer_fees = total_transfer_fees;
    this.total_decisions_evaluated = total_decisions_evaluated;
    this.alternative_leaf_net_interests = alternative_leaf_net_interests;
    this.total_outflows_paid = total_outflows_paid;
    this.outstanding_outflows = outstanding_outflows;
    this.valid = valid;
    this.decision_log = decision_log;
    this.ait_enabled = ait_enabled;
    this.ait_rate = ait_rate;
  }
  get total_interest() { return this.bookings.reduce((sum, booking) => sum + booking.total_interest, 0); }
  get ait_withheld() {
    if (!this.ait_enabled) return 0;
    let total = 0;
    for (const booking of this.bookings) {
      const totalInterest = booking.total_interest;
      booking.cash_flows.forEach((flow, index) => {
        let interest;
        if (booking.payout_type === CUMULATIVE) interest = flow.amount - booking.principal;
        else if (booking.payout_type === PERIODIC_INTEREST) interest = flow.amount - (index === booking.cash_flows.length - 1 ? booking.principal : 0);
        else interest = totalInterest / booking.cash_flows.length;
        total += Math.round(Math.max(0, interest) * this.ait_rate * 100) / 100;
      });
    }
    return Math.round(total * 100) / 100;
  }
  get net_interest() { return this.total_interest - this.total_transfer_fees - this.ait_withheld; }
  get net_interest_after_ait() { return this.net_interest; }
  get cash_retained() { return Object.values(this.accounts).reduce((sum, account) => sum + account.balance, 0); }
  get cash_flow_net_worth() { return this.cash_retained - this.outstanding_outflows.reduce((sum, item) => sum + Number(item.remaining ?? 0), 0); }
  get contributed_capital() { return this.total_principal; }
  get pre_withdrawal_value() { return this.final_value; }
  get outstanding_liabilities() { return this.outstanding_outflows.reduce((sum, item) => sum + Number(item.remaining ?? 0), 0); }
  get closing_assets() { return this.cash_retained; }
  get closing_net_worth() { return this.closing_assets - this.outstanding_liabilities; }
  get total_outflows_due() { return this.total_outflows_paid + this.outstanding_outflows.reduce((sum, item) => sum + Number(item.remaining ?? 0), 0); }
  get total_idle() { return this.#sumEventType(EventType.IDLE); }
  get total_carry_forward() { return this.#sumEventType(EventType.CARRY_FORWARD); }
  get final_value() { return this.total_principal + this.total_interest - this.total_transfer_fees - this.ait_withheld; }
  get final_value_after_ait() { return this.final_value; }
  sorted_dates() { return Object.keys(this.timeline).map(Number).sort((a, b) => a - b); }
  #sumEventType(type) {
    const days = this.timeline instanceof Map ? [...this.timeline.values()] : Object.values(this.timeline);
    return days.flat().filter(event => event.event_type === type).reduce((sum, event) => sum + event.amount, 0);
  }
}
