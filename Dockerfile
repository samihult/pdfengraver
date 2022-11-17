FROM node:18.12.1-slim

LABEL name="pdfengraver" \
	maintainer="Sami Hult <sami.hult@gmail.com>" \
	version="1.1.0" \
	description="Yet another headless Chrome PDF generator"

USER root

RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_x86_64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

WORKDIR /home/pptruser
RUN groupadd -r pptruser &&  \
    useradd -r -g pptruser -G audio,video pptruser && \
    chown -R pptruser:pptruser /home/pptruser

COPY --chown=pptruser:pptruser package.json package-lock.json ./
COPY --chown=pptruser:pptruser src ./src
COPY --chown=pptruser:pptruser playground ./playground

USER pptruser
RUN npm install --omit=dev --quiet

VOLUME /local-assets
EXPOSE 5045

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
