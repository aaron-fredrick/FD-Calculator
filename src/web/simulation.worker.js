import { runSimulationTask } from "./simulation-task.js";

const TRUSTED_MESSAGE_ORIGINS = new Set([
  self.location.origin,
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

self.addEventListener("message", event => {
  const origin = event.origin;
  if (origin && !TRUSTED_MESSAGE_ORIGINS.has(origin)) return;

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
