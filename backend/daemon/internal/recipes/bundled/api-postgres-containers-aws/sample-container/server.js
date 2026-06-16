const http = require("node:http");

const port = Number.parseInt(process.env.PORT || "80", 10);
const databaseUrl = process.env.DATABASE_URL || null;

const server = http.createServer((request, response) => {
  const payload = {
    ok: true,
    message: "Hello from the CloudSprocket sample container",
    method: request.method,
    path: request.url,
    databaseConfigured: Boolean(databaseUrl),
  };

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Sample container listening on ${port}`);
});
