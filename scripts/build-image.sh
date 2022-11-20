#!/usr/bin/env bash

if [[ ! -f Dockerfile ]] ; then
  echo "Must be executed in the directory that contains Dockerfile"
  exit 1
fi

docker build . -t samihult/pdfengraver:latest
