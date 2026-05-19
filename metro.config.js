const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

// Enable package.json "exports" resolution so Firebase's react-native
// build (dist/index.rn.js) is used instead of the default ESM build.
//
// resolverMainFields: drop 'react-native' from the top-level field list.
// react-native-gesture-handler sets "react-native": "src/index.ts" (raw TS
// source) which Metro can't compile from node_modules. Firebase doesn't need
// this field because it resolves correctly via the "exports" map above.
// Falling back to 'browser' → 'main' fixes gesture-handler while keeping
// Firebase on its proper dist/index.rn.js build.
const config = {
  resolver: {
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'require', 'default'],
    resolverMainFields: ['browser', 'main'],
    blockList: [
      // Xcode's script sandbox blocks Metro from scanning these paths
      /.*\.xcodeproj\/.*/,
      /.*\.xcworkspace\/.*/,
      /ios\/Pods\/.*/,
      /ios\/build\/.*/,
    ],
    // react-native-qrcode-svg uses `qrcode` only for QRCode.create().
    // The package's default entry (lib/server.js) eagerly requires pngjs
    // which is a Node-only binary — it crashes in RN at import time.
    // Alias to the pure-JS core module that exposes only `create()`.
    extraNodeModules: {
      qrcode: path.resolve(__dirname, 'node_modules/qrcode/lib/core/qrcode.js'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
