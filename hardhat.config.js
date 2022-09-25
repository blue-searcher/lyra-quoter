require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require('hardhat-abi-exporter');
require("@nomiclabs/hardhat-etherscan");
require('hardhat-dependency-compiler');

const { lyraContractPaths } = require('@lyrafinance/protocol/dist/test/utils/package/index-paths');

module.exports = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.optimism.io`,
      }
    },
    optimism: {
      url: "https://mainnet.optimism.io",
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY}`] : [],
    },
  },
  mocha: {
    timeout: 60000 * 5,
  },
  gasReporter: {
    enabled: true,
  },
  abiExporter: {
    path: './abi',
    clear: true,
    spacing: 2,
  },
  etherscan: {
    apiKey: {
      optimisticEthereum: process.env.ETHERSCAN_API_KEY,
    }
  },
  dependencyCompiler: {
    paths: lyraContractPaths,
  }
};
