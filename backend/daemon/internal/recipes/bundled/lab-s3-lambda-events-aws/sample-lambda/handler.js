exports.handler = async (event) => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));
  return { statusCode: 200, body: "processed" };
};
