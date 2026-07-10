exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "ok",
      lab: "api-auth",
      time: new Date().toISOString(),
    }),
  };
};
