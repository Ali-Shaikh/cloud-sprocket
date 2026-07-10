exports.handler = async (event) => {
  console.log("CloudSprocket SNS fanout received:", JSON.stringify(event));
  const msg = event.Records ? event.Records[0].Sns.Message : event;
  return { ok: true, message: msg };
};
