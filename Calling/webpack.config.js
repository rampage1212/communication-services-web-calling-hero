// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

module.exports = (env) => {
  const babelConfig = require('./.babelrc.js');
  const commonConfig = require('./common.webpack.config')(__dirname, env, babelConfig);
  commonConfig.resolve = {
    ...commonConfig.resolve,
    fallback: {
      path: require.resolve('path-browserify'),
      os: require.resolve('os-browserify/browser'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      vm: require.resolve('vm-browserify')
    }
  };
  return commonConfig;
};
