const path = require("path");
const { readFile } = require("fs/promises");
const mime = require("mime-types");

const { withPerformanceBudget } = require("./performanceBudgeting");
const { browserPool } = require("./browserPool");

async function generatePdf(html, { contentLocation, timeouts, serverTimings }) {
  let page;
  let browser;
  let version;

  try {
    await withPerformanceBudget(timeouts, serverTimings, "init", async () => {
      browser = await browserPool.acquire();
      version = await browser.version();
    });

    if (!browser) {
      throw new Error("Failed to initialized browser");
    }

    await withPerformanceBudget(timeouts, serverTimings, "load", async () => {
      return new Promise(async (resolve, reject) => {
        page = await browser.newPage();
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
                  ])
                `);

          resolve(page);
        } catch (error) {
          reject(error);
        }
      });
    });

    if (!page) {
      throw new Error("Failed to load page");
    }

    const pdf = await withPerformanceBudget(
      timeouts,
      serverTimings,
      "rend",
      () =>
        page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
        })
    );

    return { version, pdf };
  } finally {
    if (page) {
      await page.close();
    }

    if (browser) {
      await browserPool.destroy(browser);
    }
  }
}

module.exports = { generatePdf };
