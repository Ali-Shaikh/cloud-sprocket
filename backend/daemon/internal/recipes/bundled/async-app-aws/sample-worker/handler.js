exports.handler = async (event) => {
  const records = event.Records || [];

  console.log("CloudSprocket sample async worker received", records.length, "record(s)");
  console.log("TABLE_NAME:", process.env.TABLE_NAME || null);

  for (const record of records) {
    console.log("SQS record:", JSON.stringify(record));
  }

  return {
    ok: true,
    processed: records.length,
  };
};