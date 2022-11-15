const genericPool = require("generic-pool");
const puppeteer = require("puppeteer");

const browserPool = genericPool.createPool(
  {
    create() {
      return puppeteer.launch({
        product: "chrome",
        args: [
          "--no-first-run",
          "--no-zygote",
          "--disable-web-security",
          "--enable-local-file-accesses",
          "--allow-file-access-from-files",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-audio-input",
          "--disable-audio-output",
          "--disable-breakpad",
          "--no-crash-upload",
        ],
      });
    },
    validate(browser) {
      return Promise.race([
        new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
        browser
          .version()
          .then(() => true)
          .catch(() => false),
      ]);
    },
    destroy(browser) {
      return browser.close();
    },
  },
  {
    min: 2,
    max: 10,
    testOnBorrow: true,
    acquireTimeoutMillis: 15000,
  }
);

module.exports = {
  browserPool,
};
