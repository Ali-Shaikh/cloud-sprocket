exports.handler = async (event) => {
  const records = event.Records || [];

  console.log("CloudSprocket S3 event processor received", records.length, "record(s)");

  for (const record of records) {
    const bucket = record.s3 && record.s3.bucket ? record.s3.bucket.name : "unknown";
    const key = record.s3 && record.s3.object ? record.s3.object.key : "unknown";
    console.log("S3 event:", record.eventName, "bucket=", bucket, "key=", key);
  }

  return {
    ok: true,
    processed: records.length,
  };
};
