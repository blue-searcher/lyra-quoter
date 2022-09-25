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

  const forkAndDeploy = async (blockNumber, eoaAddress = SUSD_HOLDER_ADDRESS) => {
    await resetChain(blockNumber);

    quoter = await deploy();
    optionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, OPTION_MARKET_WRAPPER);

    account = await impersonateAccount(eoaAddress);
    sUSDBalance = await getSUSDBalance(account.address);
    await approve(account, sUSDBalance);
  };

  //https://optimistic.etherscan.io/tx/0x0f1b061a9b98574dd44e546362dc8606dbc16d1b6caac486115f0a48b2e2f40a
  describe("Force close", function () {
      
    it("check", async function () {
      await forkAndDeploy(23772100, "0x6710073666E7b9E8c1bA1d9D4CDeD9d1513D1D1F");

      const strikeId = "129";  
      const optionAmount = "2300000000000000000"
      const iterations = "1";
      const optionType = "2"; 

      const forceClosePositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 4337,
        iterations: iterations,
        setCollateralTo: 0,
        currentCollateral: "2300000000000000000",
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: "8437110245864999101",
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.forceClosePosition(forceClosePositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount, "1", true);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

  });

  describe("InvalidTradeDirection", function () {
      
    it("revert", async function () {
      await forkAndDeploy(23772100, "0x6710073666E7b9E8c1bA1d9D4CDeD9d1513D1D1F");

      const strikeId = "129";  
      const optionAmount = "2300000000000000000"
      const iterations = "1";
      const optionType = "2"; 

      await expect(
        quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount, "0", true)
      ).revertedWith("InvalidTradeDirection");
    });

  });

});