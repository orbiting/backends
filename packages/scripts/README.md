Scripts
-------

A set of scripts to orbit planets properly.

### Prerequisites

1.  Setup `GITHUB_DUPLIKATOR_SOURCE`, `GITHUB_DUPLIKATOR_TARGET` credential  
    bags. An example is available in root folder's `.env.examples`.

`GITHUB_DUPLIKATOR_SOURCE` is an GitHub Application, Organization Account
allowed to list an organization's private repositories.

`GITHUB_DUPLIKATOR_TARGET` is an GitHub Application, Organization Account
allowed to create repositories in an organization.

### Get repositories

    DEBUG=scripts:* packages/scripts/get-repos.js

### Create a single repository

    echo repository-name | DEBUG=scripts:* packages/scripts/create-repos.js

### Create multiple repositories

    for REPO in repo-1 repo-2; do echo $REPO; done | \
      DEBUG=scripts:* packages/scripts/create-repos.js
