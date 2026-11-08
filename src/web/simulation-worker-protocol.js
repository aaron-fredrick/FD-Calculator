/**
 * Validate the application protocol for messages sent to the dedicated
 * simulation worker. Dedicated Worker MessageEvents do not provide a useful
 * event.origin value for authenticating this channel; the worker instance is
 * created and owned by the application, so validate the message contract.
 */
export function isSimulationRequest(message) {
  return Boolean(
    message &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    message.type === "simulate" &&
    Number.isSafeInteger(message.id) &&
    message.id > 0 &&
    message.payload &&
    typeof message.payload === "object" &&
    !Array.isArray(message.payload)
  );
}
