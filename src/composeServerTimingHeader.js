function composeServerTimingHeader(performanceValues) {
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

module.exports = {
  composeServerTimingHeader,
};
