exports.handler = async (event) => {
  const records = event.Records || [];
  console.log(`Processed ${records.length} SQS record(s)`);
  return { ok: true, records: records.length };
};