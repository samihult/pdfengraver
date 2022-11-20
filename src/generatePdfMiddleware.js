const { withPerformanceBudget } = require("./performanceBudgeting");
const { generatePdf } = require("./generatePdf");

async function generatePdfMiddleware(req, res, next) {
  try {
    await withPerformanceBudget(
      res.locals.timeouts,
      res.locals.serverTimings,
      "total",
      async () => {
        const { pdf, version } = await generatePdf(res.locals.html, res.locals);

        res
          .header("Server-Timing", res.locals.serverTimingsHeader())
          .header("X-Powered-By", version)
          .contentType("application/pdf")
          .send(pdf);
      }
    );
  } catch (error) {
    next(error);
  }

  return next();
}

module.exports = {
  generatePdfMiddleware,
};
