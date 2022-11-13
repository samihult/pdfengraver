function resolveContentLocation(req) {
  let contentLocation = req.get("Content-Location") || "file:///";

  if (!contentLocation.endsWith("/")) {
    contentLocation += "/";
  }

  return contentLocation;
}

module.exports = {
  resolveContentLocation,
};
