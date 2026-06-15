exports.handler = async (event) => {
  const ranAt = new Date().toISOString();

  console.log("CloudSprocket sample scheduled job ran at", ranAt);
  console.log("Trigger event:", JSON.stringify(event));

  return {
    ok: true,
    ranAt,
    source: event.source || "manual",
  };
};
