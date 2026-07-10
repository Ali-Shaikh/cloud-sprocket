module.exports = async function (context, myBlob) {
  context.log("CloudSprocket Azure blob event processed blob size:", myBlob.length);
};
