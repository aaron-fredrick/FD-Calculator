import { runSimulationTask } from "./simulation-task.js";

self.addEventListener("message", event => {
  const message = event.data;
  if (!message || message.type !== "simulate") return;
  const { id, payload } = message;
  try {
    const result = runSimulationTask(payload);
    self.postMessage({ id, type: "result", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: { name: error?.name || "Error", message: error?.message || String(error) }
    });
  }
});
