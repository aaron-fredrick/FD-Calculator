import { runSimulationTask } from "./simulation-task.js";
import { isSimulationRequest } from "./simulation-worker-protocol.js";

const LOG = "[FD Cal][worker]";

self.addEventListener("message", event => {
  const message = event.data;
  if (!isSimulationRequest(message)) {
    console.warn(LOG, "Ignored invalid simulation request", {
      type: message?.type,
      id: message?.id
    });
    return;
  }

  const { id, payload } = message;
  const startedAt = performance.now();
  console.info(LOG, "Simulation request received", {
    id,
    strategy: payload?.strategy,
    simulationMode: payload?.simulation?.mode,
    accountCount: payload?.accounts?.length,
    optionCount: payload?.options?.length,
    inflowCount: payload?.inflow_schedule?.length,
  });

  // Acknowledge receipt before entering the synchronous simulation engine.
  self.postMessage({ id, type: "started", startedAt });
  console.info(LOG, "Simulation computation started", { id });

  try {
    const result = runSimulationTask(payload);
    const elapsedMs = performance.now() - startedAt;
    console.info(LOG, "Simulation computation completed", {
      id,
      elapsedMs: Math.round(elapsedMs),
      valid: result?.valid,
      bookingCount: result?.bookings?.length
    });
    self.postMessage({ id, type: "result", result, elapsedMs });
  } catch (error) {
    const elapsedMs = performance.now() - startedAt;
    console.error(LOG, "Simulation computation failed", {
      id,
      elapsedMs: Math.round(elapsedMs),
      name: error?.name || "Error",
      message: error?.message || String(error)
    }, error);
    self.postMessage({
      id,
      type: "error",
      elapsedMs,
      error: { name: error?.name || "Error", message: error?.message || String(error) }
    });
  }
});
