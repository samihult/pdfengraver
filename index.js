const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { performance } = require("perf_hooks");
const { CRIExtra, Browser } = require("chrome-remote-interface-extra");
const Handlebars = require("handlebars");
const { readFile } = require("fs/promises");
const path = require("path");

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

const performanceValues = {};

function serverTimings() {
  return Object.entries(performanceValues)
    .map(([key, { dur, desc }]) => {
      const parts = [
        key,
        `dur=${dur.toFixed(3)}`,
        desc && `desc="${desc.replaceAll('"', '\\""')}"`,
      ];
      return parts.filter(Boolean).join(";");
    })
    .join(", ");
}

function resolveContentLocation(req) {
  let contentLocation = req.get("Content-Location") || "file:///";
  if (!contentLocation.endsWith("/")) {
    contentLocation += "/";
  }
  return contentLocation;
}

app.post("/conv", async (req, res) => {
  const contentLocation = resolveContentLocation(req);
  const { pdf, versionInfo } = await generatePdf(req.body, { contentLocation });

  res
    .header("Server-Timing", serverTimings())
    .header(
      "X-Powered-By",
      `${versionInfo.product}/${versionInfo.revision}; ` +
        `CDP/${versionInfo.protocolVersion}; ` +
        `V8/${versionInfo.jsVersion}`
    )
    .contentType("application/pdf")
    .send(pdf);
});

app.post("/tmpl/:filename", async (req, res) => {
  const contentLocation = resolveContentLocation(req);

  const templateStartTime = performance.now();

  const { filename } = req.params;
  const src = await readFile(path.join("/assets", filename), {
    encoding: "utf8",
  });

  const template = Handlebars.compile(src);
  const html = template(req.body);
  const templateEndTime = performance.now();

  performanceValues.tmpl = { dur: templateEndTime - templateStartTime };

  const { pdf, versionInfo } = await generatePdf(html, { contentLocation });

  res
    .header("Server-Timing", serverTimings())
    .header(
      "X-Powered-By",
      `${versionInfo.product}/${versionInfo.revision}; ` +
        `CDP/${versionInfo.protocolVersion}; ` +
        `V8/${versionInfo.jsVersion}`
    )
    .contentType("application/pdf")
    .send(pdf);
});

const listeningMessage = process.env.PE_SILENT
  ? ""
  : `\nListening on ${apiPort}.` +
    (process.env.PE_QUIET
      ? ""
      : `\nPlayground ${
          process.env.PE_DISABLE_PLAYGROUND
            ? "disabled"
            : "enabled at " + baseUrl
        }
  
For additional information, please refer to:
- https://hub.docker.com/u/samihult/pdfengraver 
- https://github.com/samihult/pdfengraver  
`);

app.listen(apiPort, () => {
  console.log(listeningMessage);
});

async function generatePdf(html, { contentLocation }) {
  let cdpClient;
  let client;
  let browser;

  const startTime = performance.now();
  try {
    const browserStartTime = performance.now();
    client = await CRIExtra({ host: "localhost", port: 9222 });
    browser = await Browser.create(client, {
      contextIds: [],
      ignoreHTTPSErrors: true,
    });
    const versionInfo = await browser.versionInfo();
    const browserEndTime = performance.now();
    performanceValues.init = { dur: browserEndTime - browserStartTime };

    const loadStartTime = performance.now();
    const page = await browser.newPage();

    if (process.env.PE_TRACE_CONSOLE) {
      page.on("console", console.log);
    }

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url() === contentLocation) {
        return request.respond({
          contentType: "text/html",
          body: html,
        });
      }

      if (process.env.PE_TRACE_REQ) {
        console.log(request);
      }

      if (request.url().startsWith(contentLocation)) {
        const relativeLocation = request.url().slice(contentLocation.length);
        return readFile(path.join("/assets", relativeLocation))
          .then((fileContents) => {
            return request.respond({ body: fileContents });
          })
          .catch((error) => {
            console.warn("Failed to serve local asset, reason:", error);
            request.continue();
          });
      }

      request.continue();
    });

    await page.goto(contentLocation, { waitUntil: "networkidle2" });
    const loadEndTime = performance.now();
    performanceValues.load = { dur: loadEndTime - loadStartTime };

    const renderStartTime = performance.now();
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    const renderEndTime = performance.now();
    performanceValues.rend = { dur: renderEndTime - renderStartTime };

    return { versionInfo, pdf };
  } finally {
    if (browser) {
      await browser.disconnect();
    } else if (client) {
      await client.close();
    }
    if (cdpClient) {
      await cdpClient.close();
    }
    const endTime = performance.now();

    performanceValues.tot = { dur: endTime - startTime };
  }
}
