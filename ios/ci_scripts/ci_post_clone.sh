#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

echo "=== ci_post_clone.sh starting ==="

# --- Node.js setup ---
NODE_VERSION="20.19.1"
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  NODE_PLATFORM="darwin-arm64"
else
  NODE_PLATFORM="darwin-x64"
fi
NODE_DIR="/tmp/node-v${NODE_VERSION}-${NODE_PLATFORM}"
NODE_TAR="node-v${NODE_VERSION}-${NODE_PLATFORM}.tar.gz"

echo "Architecture: $ARCH -> using $NODE_PLATFORM"

# Check common paths first
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  echo "Node found: $(node --version) at $(which node)"
else
  echo "Node not found, downloading v${NODE_VERSION} for ${NODE_PLATFORM}..."
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TAR}" -o "/tmp/${NODE_TAR}"
  tar -xzf "/tmp/${NODE_TAR}" -C /tmp
  export PATH="${NODE_DIR}/bin:$PATH"
  echo "Node installed: $(node --version)"
fi

echo "Node: $(node --version)  npm: $(npm --version)"

# --- write .xcode.env.local so Xcode build phases find the right node ---
# with-environment.sh sources this file to set NODE_BINARY. The committed
# .xcode.env.local contains the developer's local nvm path which doesn't
# exist on CI, so we overwrite it with the actual node in PATH.
NODE_BIN=$(which node)
echo "export NODE_BINARY=${NODE_BIN}" > "$CI_PRIMARY_REPOSITORY_PATH/ios/.xcode.env.local"
echo "Wrote .xcode.env.local: NODE_BINARY=${NODE_BIN}"

# --- npm install ---
echo "=== npm install ==="
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

# --- pre-download boost to bypass archives.boost.io DNS failure in Xcode Cloud ---
# Use the JFrog mirror which serves the identical .tar.bz2 (same sha256).
BOOST_URL="https://boostorg.jfrog.io/artifactory/main/release/1.83.0/source/boost_1_83_0.tar.bz2"
BOOST_TAR="/tmp/boost_1_83_0.tar.bz2"
BOOST_PODSPEC="$CI_PRIMARY_REPOSITORY_PATH/node_modules/react-native/third-party-podspecs/boost.podspec"

if [ -f "$BOOST_PODSPEC" ]; then
  echo "Downloading boost 1.83.0 from JFrog mirror..."
  curl -fL "$BOOST_URL" -o "$BOOST_TAR"
  echo "Patching boost podspec to use local file..."
  # Replace URL with local file path; remove sha256 so CocoaPods skips the checksum
  sed -i '' \
    "s|{ :http => 'https://archives.boost.io/release/1.83.0/source/boost_1_83_0.tar.bz2', :sha256 => '6478edfe2f3305127cffe8caf73ea0176c53769f4bf1585be237eb30798c3b8e' }|{ :http => 'file://${BOOST_TAR}' }|g" \
    "$BOOST_PODSPEC"
  echo "Patched boost podspec."
fi

# --- pod install ---
echo "=== pod install ==="
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"
pod install

echo "=== ci_post_clone.sh completed successfully ==="
