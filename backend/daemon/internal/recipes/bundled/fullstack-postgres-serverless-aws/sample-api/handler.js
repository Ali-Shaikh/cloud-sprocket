exports.handler = async (event) => {
  const path = event.rawPath || event.path || "/";
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      message: "Hello from the CloudSprocket sample Postgres API",
      method,
      path,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
    }),
  };
};