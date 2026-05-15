#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# Ensure Homebrew binaries are on PATH (Xcode Cloud Apple Silicon)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "--- Node version check ---"
if command -v node >/dev/null 2>&1; then
  echo "Node already available: $(node --version)"
else
  echo "Installing node..."
  brew install node
fi

echo "--- npm version: $(npm --version) ---"

echo "--- Installing npm dependencies ---"
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

echo "--- Installing CocoaPods dependencies ---"
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"
pod install

echo "--- ci_post_clone.sh completed successfully ---"
