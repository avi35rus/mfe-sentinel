/** @type {import('@module-federation/enhanced').ModuleFederationPluginOptions} */
module.exports = {
  name: 'remote',
  exposes: {
    './Checkout':    './src/components/Checkout',
    './CartSummary': './src/components/CartSummary',
    './useCart':     './src/hooks/useCart',
  },
  remotes: {},
  shared: {
    react: {
      singleton: true,
      requiredVersion: '^17.0.0',
    },
    lodash: {
      singleton: false,
    },
  },
};
