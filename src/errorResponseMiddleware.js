function errorResponseMiddleware(req, res, next) {
  return next();
}

module.exports = {
  errorResponseMiddleware,
};
