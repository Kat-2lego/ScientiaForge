#!/usr/bin/env bash
set -euo pipefail

# Copy the frontend into Netlify's publish directory.
# Keep netlify-deploy/_redirects intact.
cp -a client/assets client/auth client/css client/js client/pages netlify-deploy/

echo "Frontend files synced to netlify-deploy."
echo "The Netlify _redirects file was preserved."
