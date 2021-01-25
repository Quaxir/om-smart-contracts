const { projectId, mnemonic } = require('./secrets.json');
const HDWalletProvider = require('@truffle/hdwallet-provider');
require("ts-node/register")

module.exports = {
  migrations_directory: "./app/migrations",
  networks: {
    marketplace: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    // From https://forum.openzeppelin.com/t/connecting-to-public-test-networks-with-truffle/2960
    ropsten: {
      provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${projectId}`),
      network_id: 3,       // Ropsten's id
      gas: 5500000,        // Ropsten has a lower block limit than mainnet
      confirmations: 2,    // # of confs to wait between deployments. (default: 0)
      timeoutBlocks: 200,  // # of blocks before a deployment times out  (minimum/default: 50)
      skipDryRun: true     // Skip dry run before migrations? (default: false for public nets )
    }
  },
  compilers: {
    solc: {
      version: "^0.5.0",
      settings: {
        optimizer: {
          enabled: true
        }
      }
    }
  }
}