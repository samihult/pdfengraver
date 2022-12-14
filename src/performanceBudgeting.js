const { performance } = require("perf_hooks");
const httpErrors = require("http-errors");

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

async function withPerformanceBudget(timeouts, timings, name, callback) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const timeoutHandle = setTimeout(() => {
      reject(
        httpErrors(
          408,
          `Performance budget exceeded (${name}, ${timeouts[name]} ms)`
        )
      );
    }, timeouts[name]);

    Promise.resolve(callback())
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeoutHandle);
        const endTime = performance.now();
        timings[name] = { dur: endTime - startTime };
      });
  });
}

module.exports = {
  resolvePerformanceBudget,
  withPerformanceBudget,
};
