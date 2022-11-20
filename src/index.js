const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const httpErrors = require("http-errors");

const { composeServerTimingHeader } = require("./composeServerTimingHeader");
const { resolveContentLocation } = require("./resolveContentLocation");
const { htmlFromBodyMiddleware } = require("./htmlFromBodyMiddleware");
const { generatePdfMiddleware } = require("./generatePdfMiddleware");
const { listeningMessage } = require("./listeningMessage");
const { browserPool } = require("./browserPool");

const {
  htmlFromHandlebarsTemplateMiddleware,
} = require("./htmlFromHandlebarsTemplateMiddleware");

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

  app.post("/conv", htmlFromBodyMiddleware, generatePdfMiddleware);

  app.post(
    "/tmpl/:filename",
    htmlFromHandlebarsTemplateMiddleware,
    generatePdfMiddleware
  );

  app.listen(apiPort, () => {
    console.log(listeningMessage({ apiPort, baseUrl }));
  });

  await browserPool.ready();

  app.get("/health", (req, res) => {
    res.sendStatus(200);
  });

  app.use((error, req, res, next) => {
    if (httpErrors.isHttpError(error)) {
      const { message, statusCode } = error;
      console.error(statusCode, error);
      return res
        .header("Server-Timing", res.locals.serverTimingsHeader())
        .status(statusCode)
        .send(`${statusCode} ${message}`);
    }

    res.status(500).send(error.message);
  });
}

run().catch((error) => {
  console.error("FATAL ERROR");
  console.error(error);
  process.exit(1);
});
