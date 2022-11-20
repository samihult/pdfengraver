const httpErrors = require("http-errors");

function htmlFromBodyMiddleware(req, res, next) {
  if (!req.body) {
    return next(httpErrors(400), "Empty request body");
  }

  res.locals.html = req.body;
  return next();
}

module.exports = {
  htmlFromBodyMiddleware,
};
