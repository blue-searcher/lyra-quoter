const { expect } = require("chai");
const { ethers } = require("hardhat");

const erc20Abi = require("./abi/erc20");
const lyraAbi = require("./abi/lyra");

const UNIT = ethers.BigNumber.from("1000000000000000000");

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
    "0x1d42a98848e022908069c2c545aE44Cc78509Bc8",
    "0xbfa31380ED380cEb325153eA08f296A45A489108",
    "0x5Db73886c4730dBF3C562ebf8044E19E8C93843e",
    "0x73b161f1bcF37048A5173619cda53aaa56A28Be0",
    "0xbb3e8Eac35e649ed1071A9Ec42223d474e67b19A"
  );
  await quoter.deployed();
  return quoter;
};

const getSUSDBalance = async (addr) => {
  const SUSDContract = await ethers.getContractAt(erc20Abi, "0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9");
  return SUSDContract.balanceOf(addr);
};

const impersonateAccount = async (addr) => {
  const result = await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [addr],
  });
  return await ethers.getSigner(addr);
};

describe("LyraQuoter", function () {
  let quoter;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    quoter = await deploy();
  });

  describe("quote()", function () {
      
    it("1 iteration buy call", async function () {
      const strikeId = "122";
      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(strikeId, iterations, optionType, optionAmount);
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

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(strikeId, iterations, optionType, optionAmount);
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

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(strikeId, iterations, optionType, optionAmount);
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

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(strikeId, iterations, optionType, optionAmount);
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

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const quoteResult = await quoter.quote(strikeId, iterations, optionType, optionAmount);
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

      const account = await impersonateAccount(process.env.SUSD_HOLDER_ADDRESS);

      const sUSDBalance = await getSUSDBalance(account.address);
      const OptionMarketWrapper = await ethers.getContractAt(lyraAbi.OPTION_MARKET_WRAPPER, "0xCCE7819d65f348c64B7Beb205BA367b3fE33763B");

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

      const simulatedResult = await OptionMarketWrapper.connect(account).callStatic.openPosition(openPositionParams);
      const simulatedTotalCost = simulatedResult.totalCost.div(UNIT);
      const simulatedTotalFee = simulatedResult.totalFee.div(UNIT);

      const fullQuoteResult = await quoter.fullQuotes(strikeId, iterations, optionAmount);
      const quotePremium = fullQuoteResult[0][0].div(UNIT);
      const quoteFee = fullQuoteResult[1][0].div(UNIT);

      expect(quotePremium).to.equals(simulatedTotalCost);
      expect(quoteFee).to.equals(simulatedTotalFee);
    });

  });

});