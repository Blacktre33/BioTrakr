#!/bin/bash

# Ensure postbuild runs after initial build
pnpm build

# Watch for changes in dist/apps/api/src/main.js and run postbuild
while inotifywait -e close_write dist/apps/api/src/main.js 2>/dev/null || \
      fswatch -1 dist/apps/api/src/main.js 2>/dev/null || \
      sleep 2; do
  pnpm run postbuild
done &

# Start NestJS in watch mode
pnpm nest start --watch

