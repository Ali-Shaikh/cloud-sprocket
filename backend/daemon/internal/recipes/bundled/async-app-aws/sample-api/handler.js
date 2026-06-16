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

  const path = event.rawPath || event.path || "/";
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";

  if (method !== "POST" || path !== "/jobs") {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Use POST /jobs to enqueue work" }),
    };
  }

  const body = event.body ?? "";
  const isBase64 = event.isBase64Encoded === true;
  const payload = isBase64 ? Buffer.from(body, "base64").toString("utf8") : body;

  let messageBody = payload;
  if (payload !== "") {
    try {
      messageBody = JSON.stringify(JSON.parse(payload));
    } catch {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Request body must be valid JSON" }),
      };
    }
  } else {
    messageBody = JSON.stringify({ submittedAt: new Date().toISOString() });
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
    }),
  );

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, queued: true }),
  };
};