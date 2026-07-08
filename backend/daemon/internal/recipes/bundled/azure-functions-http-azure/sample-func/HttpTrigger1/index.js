module.exports = async function (context, req) {
  context.log("CloudSprocket Azure Functions sample HTTP trigger processed a request.");
  const name = (req.query.name || (req.body && req.body.name)) || "world";
  context.res = {
    status: 200,
    body: { message: "Hello " + name + " from CloudSprocket Azure sample" }
  };
};
