#!/usr/bin/env bash
set -euo pipefail
key=${1:?private key path required}
hosts=${2:?known hosts path required}
# The container owns its private key; the deployment runner only needs to mount it.
if [[ -e "$key" || -e "$hosts" || -L "$key" || -L "$hosts" ]]; then
  if [[ ! -f "$key" || ! -f "$hosts" ]]; then
    echo 'Configured Git credentials require both a private key and pinned known_hosts file.' >&2
    exit 2
  fi
  printf '%s\n' deploy/compose.git-secrets.example.yml
fi
