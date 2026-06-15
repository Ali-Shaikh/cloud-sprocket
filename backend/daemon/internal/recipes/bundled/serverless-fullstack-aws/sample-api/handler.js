exports.handler = async (event) => {
  const path = event.rawPath || event.path || "/";
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      message: "Hello from the CloudSprocket sample API",
      method,
      path,
      table: process.env.TABLE_NAME || null,
    }),
  };
};
