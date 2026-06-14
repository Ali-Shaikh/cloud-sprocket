// Minimal Node.js handler for the scheduled-job recipe. Replace with your own
// task; the recipe invokes it on the schedule expression via an EventBridge
// rule. The `event` argument carries the EventBridge scheduled-event payload.
exports.handler = async (event) => {
  console.log("Scheduled job ran at", new Date().toISOString());
  console.log("Trigger event:", JSON.stringify(event));
  return { ok: true, ranAt: new Date().toISOString() };
};
