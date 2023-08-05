const Handlebars = require("handlebars");
const httpErrors = require("http-errors");
const { readFileSync } = require("fs");
const path = require("path");

async function instantiateHandlebars() {
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

  return handlebars;
}
