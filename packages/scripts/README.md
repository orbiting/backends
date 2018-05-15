Scripts
-------

A set of scripts to orbit planets properly.

### Prerequisites

Setup `GITHUB_DUPLIKATOR_SOURCE`, `GITHUB_DUPLIKATOR_TARGET` credential bags.
An example is available in root folder's `.env.examples`.

* `GITHUB_DUPLIKATOR_SOURCE` is an GitHub Application, Organization Account
  allowed to list an organization's private repositories.
* `GITHUB_DUPLIKATOR_TARGET` is an GitHub Application, Organization Account
  allowed to create repositories in an organization.

When cloning or pushing repositories, `git` and used SSH credentials require
access to private repositories in organizations.

### Clone repositories from an GitHub organization to local machine

    packages/scripts/download-repos.sh ../repos

`../repos` is a folder repositories will be cloned into.

### Push local repository folders to GitHub organization

    packages/scripts/upload-repos.sh ../repos/*

`../repos/*` is a glob pattern path to folders containing git repositories.
Folder name will become repository name. **If repository with same name exists
in GitHub organization, it will be deleted and create from scratch.**

### Get repositories

    DEBUG=scripts:* packages/scripts/get-repos.js

### Create a single repository

    echo repository-name | DEBUG=scripts:* packages/scripts/create-repos.js

### Create multiple repositories

    for REPO in repo-1 repo-2; do echo $REPO; done | \
      DEBUG=scripts:* packages/scripts/create-repos.js
