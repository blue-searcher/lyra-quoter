require("dotenv").config();

require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require('hardhat-abi-exporter');

module.exports = {
  solidity: "0.8.9",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.optimism.io`,
        blockNumber: 19260075
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
};
