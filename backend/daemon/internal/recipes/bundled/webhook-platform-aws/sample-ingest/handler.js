const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({});

exports.handler = async (event) => {
  const queueUrl = process.env.QUEUE_URL;
  if (!queueUrl) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "QUEUE_URL is not configured" }),
    };
  }

  const body = event.body ?? "";
  const isBase64 = event.isBase64Encoded === true;
  const payload = isBase64 ? Buffer.from(body, "base64").toString("utf8") : body;

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: payload,
    }),
  );

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, accepted: true }),
  };
};