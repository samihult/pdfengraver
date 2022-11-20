const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { resolveContentLocation } = require("./resolveContentLocation");
const { generateHandlebarsHtml } = require("./generateHandlebarsHtml");
const { composeServerTimingHeader } = require("./composeServerTimingHeader");
const { listeningMessage } = require("./listeningMessage");
const { browserPool } = require("./browserPool");
const { generatePdf } = require("./generatePdf");

const {
  withPerformanceBudget,
  resolvePerformanceBudget,
} = require("./performanceBudgeting");

const apiPort = 5045;
const baseUrl = process.env.PE_BASE_URL || "http://localhost:5045";

const app = express();

const corsMiddleware = cors({
  exposedHeaders: ["Server-Timing", "X-Powered-By"],
});

app.use(corsMiddleware);
app.options("*", corsMiddleware);

app.use(bodyParser.json());
app.use(
  bodyParser.text({
    type: "text/html",
    limit: process.env.PE_PAYLOAD_LIMIT || "10MB",
  })
);

if (!process.env.PE_DISABLE_PLAYGROUND) {
  app.use(express.static("playground"));
}

async function run() {
  app.use((req, res, next) => {
    res.locals.contentLocation = resolveContentLocation(req);
    res.locals.timeouts = resolvePerformanceBudget(req);
    res.locals.serverTimings = {};
    res.locals.serverTimingsHeader = () =>
      composeServerTimingHeader(res.locals.serverTimings);
    return next();
  });

  app.post("/conv", async (req, res, next) => {
    try {
      await withPerformanceBudget(
        res.locals.timeouts,
        res.locals.serverTimings,
        "total",
        async () => {
          const { pdf, version } = await generatePdf(req.body, res.locals);

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
  });

  app.post("/tmpl/:filename", async (req, res, next) => {
    try {
      await withPerformanceBudget(
        res.locals.timeouts,
        res.locals.serverTimings,
        "total",
        async () => {
          const html = await generateHandlebarsHtml(req, res);
          const { pdf, version } = await generatePdf(html, res.locals);

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
  });

  app.listen(apiPort, () => {
    console.log(listeningMessage({ apiPort, baseUrl }));
  });

  await browserPool.ready();

  app.get("/health", (req, res) => {
    res.sendStatus(200);
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).send(error.message);
  });
}

run().catch((error) => {
  console.error("FATAL ERROR");
  console.error(error);
  process.exit(1);
});
