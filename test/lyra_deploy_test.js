const { lyraConstants, lyraDefaultParams, lyraEvm, TestSystem } = require('@lyrafinance/protocol');
const { fastForwardTo } = require('@lyrafinance/protocol/dist/test/utils/evm');
const { toBN, currentTime } = require('@lyrafinance/protocol/dist/scripts/util/web3utils');
const { expect } = require("chai");
const { ethers } = require("hardhat");

const UNIT = ethers.BigNumber.from("1000000000000000000");

const OPEN_TRADE_DIRECTION = "0";
const CLOSE_TRADE_DIRECTION = "1";

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

const deploy = async (registerAddr) => {
  const LyraQuoter = await ethers.getContractFactory(
    "LyraQuoter", 
    {
      libraries: {
        BlackScholes: "0xE97831964bF41C564EDF6629f818Ed36C85fD520",
      },
    }
  );
  quoter = await LyraQuoter.deploy(
    registerAddr, //register
  );
  await quoter.deployed();
  return quoter;
};

describe('LyraQuoter', async () => {
  let lyraTestSystem;
  let boardId;
  let strikeId;
  let deployer;

  let quoter;

  const forkAndDeploy = async (blockNumber) => {
    await resetChain(blockNumber);

    const spotPrice = toBN('3000');
    boardId = ethers.BigNumber.from(0);
    const boardParameter = {
      expiresIn: lyraConstants.DAY_SEC * 7,
      baseIV: '0.9',
      strikePrices: ['2500', '3000', '3200', '3400', '3550'],
      skews: ['1.1', '1', '1.1', '1.3', '1.3'],
    };
    const initialPoolDeposit = toBN('1500000'); // 1.5m

    const addresses = await ethers.getSigners();
    deployer = addresses[0];

    const pricingParams = {
      ...lyraDefaultParams.PRICING_PARAMS,
      standardSize: toBN('50'),
      spotPriceFeeCoefficient: toBN('0.001'),
      vegaFeeCoefficient: toBN('60'),
    };

    lyraTestSystem = await TestSystem.deploy(deployer, false, false, { pricingParams });
    await TestSystem.seed(deployer, lyraTestSystem, {
      initialBoard: boardParameter,
      initialBasePrice: spotPrice,
      initialPoolDeposit: initialPoolDeposit,
    });

    const boards = await lyraTestSystem.optionMarket.getLiveBoards();
    boardId = boards[0];

    await lyraTestSystem.optionGreekCache.updateBoardCachedGreeks(boardId);
    await lyraEvm.fastForward(600);

    const strikes = await lyraTestSystem.optionMarket.getBoardStrikes(boardId);
    strikeId = strikes[0];

    quoter = await deploy(lyraTestSystem.lyraRegistry.address);
  };

  describe("TradeDeltaOutOfRange", function () {
    it("revert", async function () {
      await forkAndDeploy(25180684);

      let tradeLimitParams = {
        ...lyraDefaultParams.TRADE_LIMIT_PARAMS,
        minDelta: toBN('1'),
      };
      await lyraTestSystem.optionMarketPricer.setTradeLimitParams(tradeLimitParams);

      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(lyraTestSystem.optionMarket.address, strikeId, iterations, optionType, optionAmount, OPEN_TRADE_DIRECTION, false)
      ).revertedWith("TradeDeltaOutOfRange");
    });
  });
  
  describe("VolSkewOrBaseIvOutsideOfTradingBounds", function () {
    it("revert", async function () {
      await forkAndDeploy(24283066); 

      let tradeLimitParams = {
        ...lyraDefaultParams.TRADE_LIMIT_PARAMS,
        minSkew: toBN('2'),
        maxSkew: toBN('0.5'),
      };
      await lyraTestSystem.optionMarketPricer.setTradeLimitParams(tradeLimitParams);

      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(lyraTestSystem.optionMarket.address, strikeId, iterations, optionType, optionAmount, OPEN_TRADE_DIRECTION, false)
      ).revertedWith("VolSkewOrBaseIvOutsideOfTradingBounds");
    });
  });

  describe("TradingCutoffReached", function () {
    it("revert", async function () {
      await forkAndDeploy(23393450);

      const board = await lyraTestSystem.optionMarket.getOptionBoard(boardId);
      await fastForwardTo(parseInt(board.expiry.toString()) - 1000); // just before board expiry

      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(lyraTestSystem.optionMarket.address, strikeId, iterations, optionType, optionAmount, OPEN_TRADE_DIRECTION, false)
      ).revertedWith("TradingCutoffReached");
    });
  });

  describe("ForceCloseSkewOutOfRange", function () {
    it("revert", async function () {
      await forkAndDeploy(23393450);

      let tradeLimitParams = {
        ...lyraDefaultParams.TRADE_LIMIT_PARAMS,
        absMinSkew: toBN('2'),
        minSkew: toBN('2'),
        absMaxSkew: toBN('0.5'),
        maxSkew: toBN('0.5'),
      };
      await lyraTestSystem.optionMarketPricer.setTradeLimitParams(tradeLimitParams);

      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(lyraTestSystem.optionMarket.address, strikeId, iterations, optionType, optionAmount, CLOSE_TRADE_DIRECTION, true)
      ).revertedWith("ForceCloseSkewOutOfRange");
    });
  });

  describe("ForceCloseDeltaOutOfRange", function () {
    it("revert", async function () {
      await forkAndDeploy(23393450);

      let tradeLimitParams = {
        ...lyraDefaultParams.TRADE_LIMIT_PARAMS,
        minForceCloseDelta: toBN('0'),
      };
      await lyraTestSystem.optionMarketPricer.setTradeLimitParams(tradeLimitParams);

      const optionAmount = ethers.BigNumber.from("1").mul(UNIT);
      const iterations = "1";
      const optionType = "0"; //buy call

      await expect(
        quoter.quote(lyraTestSystem.optionMarket.address, strikeId, iterations, optionType, optionAmount, CLOSE_TRADE_DIRECTION, true)
      ).revertedWith("ForceCloseDeltaOutOfRange");
    });
  });

});