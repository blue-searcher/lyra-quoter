const { expect } = require("chai");
const { ethers } = require("hardhat");

const erc20Abi = require("./abi/erc20");
const lyraAbi = require("./abi/lyra");

const UNIT = ethers.BigNumber.from("1000000000000000000");

const SUSD_ADDRESS = "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9";
const OPTION_MARKET_WRAPPER = "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B";
const ETH_OPTION_MARKET = "0x1d42a98848e022908069c2c545aE44Cc78509Bc8";

const SUSD_HOLDER_ADDRESS = "0xCB33844b365c53D3462271cEe9B719B6Fc8bA06A"; //random EOA found on https://optimistic.etherscan.io/token/0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9#balances

const resetChain = async (blockNumber) => {
  return await ethers.provider.send("hardhat_reset", [
    {
      forking: {
        jsonRpcUrl: `https://mainnet.optimism.io`,
        blockNumber: blockNumber,
      },
    },
  ]);
};

const deploy = async () => {
  const LyraQuoter = await ethers.getContractFactory(
    "LyraQuoter", 
    {
      libraries: {
        BlackScholes: "0xE97831964bF41C564EDF6629f818Ed36C85fD520",
      },
    }
  );
  quoter = await LyraQuoter.deploy(
    "0xF5A0442D4753cA1Ea36427ec071aa5E786dA5916", //register
  );
  await quoter.deployed();
  return quoter;
};

const getSUSDBalance = async (addr) => {
  const SUSDContract = await ethers.getContractAt(erc20Abi, SUSD_ADDRESS);
  return SUSDContract.balanceOf(addr);
};

const impersonateAccount = async (addr) => {
  const result = await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [addr],
  });
  return await ethers.getSigner(addr);
};

const approve = async (signer, amount) => {
  const SUSDContract = await ethers.getContractAt(erc20Abi, SUSD_ADDRESS);
  await SUSDContract.connect(signer).approve(OPTION_MARKET_WRAPPER, amount);
};


describe("LyraQuoter", function () {
  let quoter;
  let optionMarketWrapper;

  let account;
  let sUSDBalance;

  const forkAndDeploy = async (blockNumber) => {
    await resetChain(blockNumber);

    quoter = await deploy();
    optionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, OPTION_MARKET_WRAPPER);

    account = await impersonateAccount(SUSD_HOLDER_ADDRESS);
    sUSDBalance = await getSUSDBalance(account.address);
    await approve(account, sUSDBalance);
  };

  //https://optimistic.etherscan.io/tx/0x6319a43042a3b67b25a74b6e1fde4e0650907902b28427fa3c77f3baf80a5214#eventlog
  describe("TradingCutoffReached", function () {
      
    it("revert", async function () {
      await forkAndDeploy(23393450); //random block some seconds before board.expiry

      const strikeId = "97";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount, false)
      ).revertedWith("TradingCutoffReached");
    });

  });

  describe("VolSkewOrBaseIvOutsideOfTradingBounds", function () {
      
    it("revert", async function () {
      await forkAndDeploy(24283066); //random block, only amount matter here

      const strikeId = "130";  //random strike compatible with block, only amount matter here
      const optionAmount = ethers.BigNumber.from("100000000").mul(UNIT); //"size is size" cit.
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount, false)
      ).revertedWith("VolSkewOrBaseIvOutsideOfTradingBounds");
    });

  });

});