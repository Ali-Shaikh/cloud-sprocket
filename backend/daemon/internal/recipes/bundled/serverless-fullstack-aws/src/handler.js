// Minimal Node.js handler for the serverless full-stack recipe. Replace with
// your own application backend; the recipe wires it to API Gateway and grants
// access to the DynamoDB table via the TABLE_NAME environment variable.
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Hello from a CloudSprocket recipe",
      table: process.env.TABLE_NAME || null,
    }),
  };
};
