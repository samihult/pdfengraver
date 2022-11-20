const listeningMessage = ({ apiPort, baseUrl }) =>
  process.env.PE_SILENT
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

module.exports = {
  listeningMessage,
};
