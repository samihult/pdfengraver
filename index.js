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

const minTimeouts = {
  tmpl: 50,
  init: 10,
  load: 200,
  rend: 100,
  total: 1000,
};

const defaultPerformanceBudget = {
  tmpl: 2 * 1000,
  init: 200,
  load: 30 * 1000,
  rend: 30 * 1000,
  total: 60 * 1000,
};

const maxTimeout = Math.max(Number(process.env.PE_MAX_BUDGET || 5 * 60 * 1000));

const trim = (text) => text.trim();

function resolvePerformanceBudget(req) {
  const timeoutHeader = req.get("Performance-Budget") || "";
  const timeoutEntries = JSON.parse(JSON.stringify(defaultPerformanceBudget));
  const headerEntries = timeoutHeader.split(",").map(trim);

  for (const headerEntry of headerEntries) {
    if (!headerEntry) {
      continue;
    }

    const [headerEntryName, headerEntryValue] = headerEntry
      .split("=")
      .map(trim);

    if (!timeoutEntries[headerEntryName]) {
      continue;
    }

    timeoutEntries[headerEntryName] = resolveTimeout(
      headerEntryName,
      headerEntryValue
    );
  }

  return timeoutEntries;
}

function resolveTimeout(name, input) {
  const value = input && Number(input || 0);

  if (!value || !Number.isFinite(value)) {
    return defaultPerformanceBudget[name];
  }

  const minTimeout = minTimeouts[name];

  if (value < minTimeout) {
    return minTimeout;
  }

  if (value > maxTimeout) {
    return maxTimeout;
  }

  return value;
}

async function withTimeout(timeouts, name, callback) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`Budget exceeded (${name}, ${timeouts[name]} ms)`));
    }, timeouts[name]);

    Promise.resolve(callback())
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutHandle));
  });
}

app.post("/conv", async (req, res, next) => {
  try {
    const contentLocation = resolveContentLocation(req);
    const timeouts = resolvePerformanceBudget(req);

    await withTimeout(timeouts, "total", async () => {
      const { pdf, versionInfo } = await generatePdf(req.body, {
        contentLocation,
        timeouts,
      });

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
  } catch (error) {
    next(error);
  }
});

app.post("/tmpl/:filename", async (req, res) => {
  try {
    const contentLocation = resolveContentLocation(req);
    const timeouts = resolvePerformanceBudget(req);

    await withTimeout(timeouts, "total", async () => {
      const templateStartTime = performance.now();
      const html = await withTimeout(timeouts, "tmpl", async () => {
        const { filename } = req.params;
        const src = await readFile(path.join("/assets", filename), {
          encoding: "utf8",
        });
        const template = Handlebars.compile(src);
        return template(req.body);
      });
      const templateEndTime = performance.now();
      performanceValues.tmpl = { dur: templateEndTime - templateStartTime };

      const { pdf, versionInfo } = await generatePdf(html, {
        contentLocation,
        timeouts,
      });

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
  } catch (error) {
    next(error);
  }
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

async function generatePdf(html, { contentLocation, timeouts }) {
  let client;
  let browser;
  let versionInfo;

  const startTime = performance.now();
  try {
    const browserStartTime = performance.now();
    await withTimeout(timeouts, "init", async () => {
      client = await CRIExtra({ host: "localhost", port: 9222 });
      browser = await Browser.create(client, {
        contextIds: [],
        ignoreHTTPSErrors: true,
      });
      versionInfo = await browser.versionInfo();
    });
    const browserEndTime = performance.now();
    performanceValues.init = { dur: browserEndTime - browserStartTime };

    const loadStartTime = performance.now();
    const { page } = await withTimeout(timeouts, "load", async () => {
      return new Promise(async (resolve, reject) => {
        const page = await browser.newPage();
        page.on("error", reject);
        page.on("pageerror", reject);

        try {
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
              const relativeLocation = request
                .url()
                .slice(contentLocation.length);
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

          await page.goto(contentLocation, {
            waitUntil: "networkidle2",
            timeout: timeouts.load,
          });

          resolve({ page });
        } catch (error) {
          reject(error);
        }
      });
    });
    const loadEndTime = performance.now();
    performanceValues.load = { dur: loadEndTime - loadStartTime };

    const renderStartTime = performance.now();
    const pdf = await withTimeout(timeouts, "rend", () =>
      page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
      })
    );
    const renderEndTime = performance.now();
    performanceValues.rend = { dur: renderEndTime - renderStartTime };

    return { versionInfo, pdf };
  } finally {
    if (browser) {
      await browser.disconnect();
    } else if (client) {
      await client.close();
    }

    const endTime = performance.now();
    performanceValues.tot = { dur: endTime - startTime };
  }
}

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send(error.message);
});
