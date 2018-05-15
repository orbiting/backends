#!/bin/sh
set -eu;

# Clone an organization's repositories into a folder.
# Example:
#   packages/scripts/download-repos.sh ../repos

if [ -z "$1" ] ; then
  echo "Provide path to clone repos into e.g. ../repos"
  exit 1
fi

BASEDIR=$(dirname "$0")

DEBUG=scripts:* $BASEDIR/get-repos.js | \
  while read -r gitRepoUrl gitRepoName; \
  do \
    echo "${gitRepoName} cloning..."; \
    git clone $gitRepoUrl $1/$gitRepoName --quiet; \
    echo "${gitRepoName} cloned."; \
  done;
