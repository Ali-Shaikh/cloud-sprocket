exports.handler = async (event) => {
  console.log("CloudSprocket EventBridge processor received event:", JSON.stringify(event, null, 2));
  return { ok: true, source: event["source"] || "scheduled" };
};
