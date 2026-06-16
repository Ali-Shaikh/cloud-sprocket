exports.handler = async (event) => {
  const records = event.Records || [];

  console.log("CloudSprocket sample queue worker received", records.length, "record(s)");

  for (const record of records) {
    console.log("SQS record:", JSON.stringify(record));
  }

  return {
    ok: true,
    processed: records.length,
  };
};