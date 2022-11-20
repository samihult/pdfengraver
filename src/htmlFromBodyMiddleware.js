function htmlFromBodyMiddleware(req, res, next) {
  res.locals.html = req.body;
  return next();
}

module.exports = {
  htmlFromBodyMiddleware,
};
