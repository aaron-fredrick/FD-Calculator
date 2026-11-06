# Goal-based net-interest planning

**Status: Under development — not user selectable.**

Goal-based net-interest planning is not currently available to users. No Goal benchmark measurements, strategy comparisons or sensitivity graphs are published yet; work on the planner and its verification is ongoing. The browser marks the mode as disabled, and the public configuration validator and JSON schema reject `simulation.mode: "goal"`.

The existing goal-aware runtime, provenance ledger, strategy search code and direct runtime tests are retained as development material. They should not be interpreted as a supported public feature or as a reason to enable Goal mode.

## Agreed architecture

- **Simulation runtime:** remains strategy-independent and owns authoritative event processing, financial accounting, provenance, liquidity validation and finalisation.
- **Greedy, GSS and Absolute R+:** remain scoped date-range strategies. Their existing search objectives, ordering and performance characteristics must not be changed to serve Goal mode.
- **Absolute R:** is the intended first strategy to receive a dedicated earliest-achievement Goal objective.
- **Public availability:** Goal mode remains disabled until Absolute R's goal planner, accounting edge cases, adversarial tests and documentation are complete.

The internal goal implementation is not yet accepted as production-ready. In particular, do not infer that existing Goal-mode tests establish strategy optimality or complete user-facing support.

See the [Goal-mode rework plan](./goal-mode-rework-plan.md) for the implementation contract.
