/** @type {import('@module-federation/enhanced').ModuleFederationPluginOptions} */
module.exports = {
  name: 'host',
  exposes: {
    './Shell': './src/components/Shell',
    './Navigation': './src/components/Navigation',
  },
  remotes: {
    checkout: 'checkout@https://cdn.example.com/checkout/remoteEntry.js',
    catalog: 'catalog@https://cdn.example.com/catalog/remoteEntry.js',
  },
  shared: {
    react: {
      singleton: true,
      requiredVersion: '^18.0.0',
    },
    lodash: {
      singleton: false,
    },
  },
};
