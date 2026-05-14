#!/bin/sh
set -e

# Install Node.js via Homebrew (Xcode Cloud provides Homebrew)
brew install node@20
brew link node@20 --force --overwrite

# Install npm dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install

# Install CocoaPods dependencies
cd ios
pod install
