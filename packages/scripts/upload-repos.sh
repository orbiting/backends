#!/bin/sh
set -eu;

# Push a folder with repositories to an organization's repositories
#
# Usage:
#   packages/scripts/upload-repos.sh "<source folder glob>"
#
# Example:
#   packages/scripts/upload-repos.sh ../repos/*

if [ -z "$1" ] ; then
  echo "Provide path to repos folder e.g. ../repos/*"
  exit 1
fi

BASEDIR=$(dirname "$0")

ls -d $1 | DEBUG=scripts:* $BASEDIR/create-repos.js | while read -r gitRepoDir gitRepoUrl gitRepoName; \
  do \
    if (git -C $gitRepoDir remote | grep -Fxq duplikator) then \
      echo "${gitRepoName} updating remote..."; \
      git -C $gitRepoDir remote set-url duplikator $gitRepoUrl; \
    else \
      echo "${gitRepoName} adding remote..."; \
      git -C $gitRepoDir remote add duplikator $gitRepoUrl; \
    fi; \
    echo "${gitRepoName} pushing..."; \
    git -C $gitRepoDir push duplikator --mirror --quiet; \
    echo "${gitRepoName} pushed."; \
  done;
