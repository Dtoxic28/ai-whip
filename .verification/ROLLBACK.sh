#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then printf '%s\n' 'Usage: ROLLBACK.sh TARGET_COPY' >&2; exit 2; fi
artifact_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp -- "$artifact_dir/pristine.detector.ts" "$1"
printf '%s\n' 'Restored initial detector bytes.'
