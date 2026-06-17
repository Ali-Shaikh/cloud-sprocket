exports.handler = async (event) => {
  const records = event.Records || [];
  const tableName = process.env.TABLE_NAME || null;
  const bucketName = process.env.BUCKET_NAME || null;

  console.log("CloudSprocket batch worker received", records.length, "record(s)");
  console.log("TABLE_NAME:", tableName, "BUCKET_NAME:", bucketName);

  for (const record of records) {
    let payload = {};
    try {
      payload = JSON.parse(record.body || "{}");
    } catch {
      payload = { raw: record.body };
    }
    console.log("Processing job:", JSON.stringify({ messageId: record.messageId, payload }));
  }

  return {
    ok: true,
    processed: records.length,
    tableName,
    bucketName,
  };
};