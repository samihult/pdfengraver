const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { performance } = require("perf_hooks");
const { readFile } = require("fs/promises");
const mime = require("mime-types");
const { readFileSync } = require("fs");
const path = require("path");

const { CRIExtra, Browser } = require("chrome-remote-interface-extra");
const Handlebars = require("handlebars");

const { resolveContentLocation } = require("./resolveContentLocation");
const { performanceValues, serverTimings } = require("./serverTimings");

const {
  withTimeout,
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

app.post("/tmpl/:filename", async (req, res, next) => {
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

        const handlebars = Handlebars.create();

        handlebars.registerHelper("include", function (file, { data }) {
          if (!file) {
            throw new Error('Usage: {{include "path/file.ext"}}');
          }
          const srcPath = path.join("/assets", file);
          const src = readFileSync(srcPath, "utf-8");
          const tmpl = handlebars.compile(src, { compat: true });

          return new handlebars.SafeString(tmpl(data.root));
        });

        const registeredPartials = {};
        const originalResolvePartial = handlebars.VM.resolvePartial;
        handlebars.VM.resolvePartial = (partial, context, options) => {
          return !registeredPartials[options.name]
            ? originalResolvePartial(partial, context, options)
            : registeredPartials[options.name](context);
        };

        handlebars.registerHelper("register", function (file, options) {
          const name = options.hash.as || file;

          if (typeof file !== "string" || typeof name !== "string") {
            throw new Error(
              'Usage: {{register "file.ext"}} or {{register "path/file.ext" as="partial"}}'
            );
          }

          const srcPath = path.join("/assets", file);
          const src = readFileSync(srcPath, "utf-8");
          registeredPartials[name] = handlebars.compile(src);
        });

        const template = handlebars.compile(src);
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
              const absolutePath = path.join("/assets", relativeLocation);
              const contentType = mime.lookup(absolutePath);
              return readFile(absolutePath)
                .then((fileContents) =>
                  request.respond({ body: fileContents, contentType })
                )
                .catch((error) => {
                  console.warn("Failed to serve local asset, reason:", error);
                  request.continue();
                });
            }

            request.continue();
          });

          await page.goto(contentLocation, {
            waitUntil: "networkidle0",
            timeout: timeouts.load,
          });
          await page.evaluateHandle(`
            Promise.all([
              document.fonts.ready,
              ...Array.from(document.images).map((image) => 
                new Promise((resolve) => {
                  image.addEventListener('load', resolve);                  
                  if (image.complete) {
                    resolve();
                  }
                })
              )
            ])`);

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
