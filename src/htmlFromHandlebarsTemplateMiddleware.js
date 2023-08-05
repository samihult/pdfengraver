const httpErrors = require("http-errors");
const { readFile } = require("fs/promises");
const path = require("path");
const Handlebars = require("handlebars");
const { readFileSync } = require("fs");

const { instantiateHandlebars } = require("./instantiateHandlebars");
const { withPerformanceBudget } = require("./performanceBudgeting");

async function htmlFromHandlebarsTemplateMiddleware(req, res, next) {
  try {
    res.locals.html = await withPerformanceBudget(
      res.locals.timeouts,
      res.locals.serverTimings,
      "tmpl",
      async () => {
        const { filename } = req.params;
        if (!filename) {
          throw httpErrors(400, "Missing filename from URL");
        }

        const srcFilePath = path.join("/assets", filename);

        let src;
        try {
          src = await readFile(srcFilePath, { encoding: "utf8" });
        } catch {
          throw httpErrors(404, `Failed to read template ${filename}`);
        }

        let handlebars;
        try {
          handlebars = await instantiateHandlebars();
        } catch (error) {
          console.error("Failed to instantiate handlebars, reason:", error);
          throw httpErrors(500, "Failed to instantiate handlebars");
        }

        let template;
        try {
          template = handlebars.compile(src);
        } catch {
          throw httpErrors(404, `Failed to compile template ${filename}`);
        }

        return template(req.body);
      }
    );

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  htmlFromHandlebarsTemplateMiddleware,
};
