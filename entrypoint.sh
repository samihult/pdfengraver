#!/bin/sh

CDP_PORT=9222

google-chrome --headless --no-first-run \
  --disable-web-security \
  --enable-local-file-accesses \
  --allow-file-access-from-files \
  --no-sandbox --disable-setuid-sandbox \
  --disable-dev-shm-usage --disable-gpu \
  --disable-audio-input --disable-audio-output \
  --disable-breakpad --no-crash-upload \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=$CDP_PORT &

while ! nc -z localhost $CDP_PORT; do
  sleep 0.2
done

node src/index.js
