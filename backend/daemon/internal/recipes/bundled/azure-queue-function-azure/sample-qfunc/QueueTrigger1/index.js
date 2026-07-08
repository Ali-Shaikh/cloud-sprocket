module.exports = async function (context, myQueueItem) {
  context.log("CloudSprocket Azure queue trigger processed:", myQueueItem);
};
