const { expect } = require("chai");
const { ethers } = require("hardhat");

const erc20Abi = require("./abi/erc20");
const lyraAbi = require("./abi/lyra");

const UNIT = ethers.BigNumber.from("1000000000000000000");

const SUSD_ADDRESS = "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9";
const OPTION_MARKET_WRAPPER = "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B";
const ETH_OPTION_MARKET = "0x1d42a98848e022908069c2c545aE44Cc78509Bc8";

const SUSD_HOLDER_ADDRESS = "0xCB33844b365c53D3462271cEe9B719B6Fc8bA06A"; //random EOA found on https://optimistic.etherscan.io/token/0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9#balances

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

  beforeEach(async function () {
    quoter = await deploy();
    optionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, OPTION_MARKET_WRAPPER);

    account = await impersonateAccount(SUSD_HOLDER_ADDRESS);
    sUSDBalance = await getSUSDBalance(account.address);
    await approve(account, sUSDBalance);
  });

  describe("quote()", function () {
      
    it("1 iteration buy call", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: 0,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

    it("2 iteration buy call", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("2").mul(UNIT);
      const iterations = "2";
      const optionType = "0"; //buy call

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: 0,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

    it("1 iteration buy put", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "1"; //buy put

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: 0,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

    it("1 iteration short call", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "3"; //short call quote

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: sUSDBalance,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

    it("1 iteration short put", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "4"; //short put quote

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: sUSDBalance,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(ETH_OPTION_MARKET, strikeId, iterations, optionType, optionAmount);
      const quotePremium = quoteResult.totalPremium.div(UNIT);
      const quoteFee = quoteResult.totalFee.div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });
  });
  
  describe("fullQuotes()", function () {
     
    it("fullQuotes()", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      const openPositionParams = {
        optionMarket: "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
        strikeId: strikeId,
        positionId: 0,
        iterations: iterations,
        setCollateralTo: 0,
        currentCollateral: 0,
        optionType: optionType,
        amount: optionAmount,
        minCost: 0,
        maxCost: sUSDBalance,
        inputAmount: sUSDBalance,
        inputAsset: "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9",
      };

      const simulatedResult = await optionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const fullQuoteResult = await quoter.fullQuotes(ETH_OPTION_MARKET, strikeId, iterations, optionAmount);
      const quotePremium = fullQuoteResult[0][0].div(UNIT);
      const quoteFee = fullQuoteResult[1][0].div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

  });

});