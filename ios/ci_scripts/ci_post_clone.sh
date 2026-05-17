#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

echo "=== ci_post_clone.sh starting ==="

# --- Node.js setup ---
NODE_VERSION="20.19.1"
NODE_DIR="/tmp/node-v${NODE_VERSION}-darwin-arm64"
NODE_TAR="node-v${NODE_VERSION}-darwin-arm64.tar.gz"

# Check common paths first
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  echo "Node found: $(node --version) at $(which node)"
else
  echo "Node not found, downloading v${NODE_VERSION}..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}" -o "/tmp/${NODE_TAR}"
  tar -xzf "/tmp/${NODE_TAR}" -C /tmp
  export PATH="${NODE_DIR}/bin:$PATH"
  echo "Node installed: $(node --version)"
fi

echo "Node: $(node --version)  npm: $(npm --version)"

# --- npm install ---
echo "=== npm install ==="
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

# --- pod install ---
echo "=== pod install ==="
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"
pod install

echo "=== ci_post_clone.sh completed successfully ==="
