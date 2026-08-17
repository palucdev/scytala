#!/bin/bash

if [ "$CF_PAGES_BRANCH" == "main" ] || [ "$CF_PAGES_BRANCH" == "production" ]; then
  # Run production build
  npm run build:worker
elif [[ "$CF_PAGES_BRANCH" == feature/* ]] || [[ "$CF_PAGES_BRANCH" == fix/* ]]; then
  # Run build on feature and fix branches
  npm run build:worker
else
  # Fallback for other branches
  npm run build:worker
fi
