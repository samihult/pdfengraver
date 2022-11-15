FROM justinribeiro/chrome-headless:stable

LABEL name="pdfengraver" \
	maintainer="Sami Hult <sami.hult@gmail.com>" \
	version="1.1.0" \
	description="Yet another headless Chrome PDF generator"

USER root

WORKDIR /home/chrome
COPY --chown=chrome:chrome package.json package-lock.json ./

RUN set -x \
    && apt-get update && apt-get install -y tini procps gnupg2 curl netcat jq \
    && NODE_VERSION=$(jq -r .engines.node package.json) \
    && DEB_FILE="nodejs_${NODE_VERSION}-1nodesource1_amd64.deb" \
    && curl -sLO "https://deb.nodesource.com/node_18.x/pool/main/n/nodejs/${DEB_FILE}" \
    && apt-get install -y ./"${DEB_FILE}" && rm "${DEB_FILE}" \
    && curl -sL https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && apt-get update && apt-get install -y yarn \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=chrome:chrome src ./src
COPY --chown=chrome:chrome playground ./playground

USER chrome
RUN npm install --omit=dev --quiet

VOLUME /local-assets
EXPOSE 5045

ENTRYPOINT [ "/usr/bin/tini", "--" ]
CMD ["node", "src/index.js"]
