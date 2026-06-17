const { DynamoDBClient, ScanCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME;

exports.handler = async (event) => {
  const path = event.rawPath || event.path || "/";
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";

  if (!tableName) {
    return json(500, { ok: false, error: "TABLE_NAME is not configured" });
  }

  try {
    if (method === "GET" && path === "/items") {
      const result = await client.send(new ScanCommand({ TableName: tableName, Limit: 25 }));
      const items = (result.Items || []).map((item) => unmarshall(item));
      return json(200, { ok: true, items });
    }

    if (method === "POST" && path === "/items") {
      const body = event.body ? JSON.parse(event.body) : {};
      const id = body.id || `item-${Date.now()}`;
      const item = { id, label: body.label || "sample", createdAt: new Date().toISOString() };
      await client.send(new PutItemCommand({ TableName: tableName, Item: marshall(item) }));
      return json(201, { ok: true, item });
    }

    return json(200, {
      ok: true,
      message: "CloudSprocket DynamoDB full-stack sample API",
      routes: ["GET /items", "POST /items"],
      table: tableName,
    });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: String(error.message || error) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}