const path = require("path");
const { readFileSync } = require("fs");
const { readFile } = require("fs/promises");
const Handlebars = require("handlebars");

const { withPerformanceBudget } = require("./performanceBudgeting");

async function generateHandlebarsHtml(req, res) {
  return await withPerformanceBudget(
    res.locals.timeouts,
    res.locals.serverTimings,
    "tmpl",
    async () => {
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
    }
  );
}

module.exports = {
  generateHandlebarsHtml,
};
