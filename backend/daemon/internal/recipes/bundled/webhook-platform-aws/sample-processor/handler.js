const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAME is not configured");
  }

  const records = event.Records || [];
  console.log("CloudSprocket sample webhook processor received", records.length, "record(s)");

  for (const record of records) {
    const id = randomUUID();
    const body = record.body ?? "";

    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          id: { S: id },
          body: { S: body },
          receivedAt: { S: new Date().toISOString() },
        },
      }),
    );

    console.log("Stored webhook payload", id);
  }

  return {
    ok: true,
    processed: records.length,
  };
};