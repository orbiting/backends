#!/bin/sh
set -e;

# Clone an organization's repositories into a folder.
#
# Usage:
#   packages/scripts/download-repos.sh <source folder> (<name filter>)
#
# Example:
#   packages/scripts/download-repos.sh ../repos .*

if [ -z "$1" ] ; then
  echo "Provide path to clone repos into e.g. ../repos"
  exit 1
fi

if [ -z "$2" ] ; then
  NAMEREGEXP=".*"
else
  NAMEREGEXP=$2
fi

BASEDIR=$(dirname "$0")

DEBUG=scripts:* $BASEDIR/get-repos.js | \
  grep "${NAMEREGEXP}" | \
  while read -r gitRepoUrl gitRepoName; \
  do \
    echo "${gitRepoName} cloning..."; \
    git clone $gitRepoUrl $1/$gitRepoName --mirror --quiet; \
    echo "${gitRepoName} cloned."; \
  done;
