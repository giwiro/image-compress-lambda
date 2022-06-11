const {config} = require('@swc/core/spack');

module.exports = config({
  entry: {
    index: `${__dirname}/src/index.ts`,
  },
  output: {
    path: `${__dirname}/build`,
  },
  externalModules: ['@aws-sdk/client-s3', 'sharp', 'zlib'],
});
