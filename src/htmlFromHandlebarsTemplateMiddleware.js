const { withPerformanceBudget } = require("./performanceBudgeting");
const { readFile } = require("fs/promises");
const path = require("path");
const Handlebars = require("handlebars");
const { readFileSync } = require("fs");
const httpErrors = require("http-errors");

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

        const handlebars = Handlebars.create();

        handlebars.registerHelper("include", function (file, { data }) {
          if (!file) {
            throw new httpErrors(400, "Attempting to include without filename");
          }
          const srcPath = path.join("/assets", file);

          let src;
          try {
            src = readFileSync(srcPath, "utf-8");
          } catch {
            throw httpErrors(404, `Failed to read include ${file}`);
          }

          let tmpl;
          try {
            tmpl = handlebars.compile(src, { compat: true });
          } catch {
            throw httpErrors(404, `Failed to compile include ${file}`);
          }

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
            throw new httpErrors(
              400,
              "Attempting to register without filename or partial name"
            );
          }

          const srcPath = path.join("/assets", file);

          let src;
          try {
            src = readFileSync(srcPath, "utf-8");
          } catch {
            throw httpErrors(404, `Failed to read partial ${file}`);
          }

          let tmpl;
          try {
            registeredPartials[name] = handlebars.compile(src);
          } catch {
            throw httpErrors(404, `Failed to compile include ${file}`);
          }
        });

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
