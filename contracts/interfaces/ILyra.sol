pragma solidity ^0.8.9;

interface IOptionMarket {
    enum TradeDirection {
        OPEN,
        CLOSE,
        LIQUIDATE
    }
    enum OptionType {
        LONG_CALL,
        LONG_PUT,
        SHORT_CALL_BASE,
        SHORT_CALL_QUOTE,
        SHORT_PUT_QUOTE
    }
    enum NonZeroValues {
        BASE_IV,
        SKEW,
        STRIKE_PRICE,
        ITERATIONS,
        STRIKE_ID
    }

    struct TradeParameters {
        bool isBuy;
        bool isForceClose;
        TradeDirection tradeDirection;
        OptionType optionType;
        uint amount;
        uint expiry;
        uint strikePrice;
        ILiquidityPool.Liquidity liquidity;
        ISynthetixAdapter.ExchangeParams exchangeParams;
    }
    struct Strike {
        uint id;
        uint strikePrice;
        uint skew;
        uint longCall;
        uint shortCallBase;
        uint shortCallQuote;
        uint longPut;
        uint shortPut;
        uint boardId;
    }
    struct OptionBoard {
        uint id;
        uint expiry;
        uint iv;
        bool frozen;
        uint[] strikeIds;
    }
    struct TradeInputParameters {
        uint strikeId;
        uint positionId;
        uint iterations;
        OptionType optionType;
        uint amount;
        uint setCollateralTo;
        uint minTotalCost;
        uint maxTotalCost;
    }
    struct Result {
        uint positionId;
        uint totalCost;
        uint totalFee;
    }

    function getStrike(uint strikeId) external view returns (Strike memory);
    function getOptionBoard(uint boardId) external view returns (OptionBoard memory);
    function getSettlementParameters(uint strikeId) external view returns (
      uint strikePrice,
      uint priceAtExpiry,
      uint strikeToBaseReturned
    );
}

interface ISynthetixAdapter {
  struct ExchangeParams {
    uint spotPrice;
    bytes32 quoteKey;
    bytes32 baseKey;
    uint quoteBaseFeeRate;
    uint baseQuoteFeeRate;
  }
  function getExchangeParams(address optionMarket) external view returns (ExchangeParams memory exchangeParams);
}

interface ILiquidityPool {
  struct Liquidity {
    uint freeLiquidity;
    uint burnableLiquidity;
    uint usedCollatLiquidity;
    uint pendingDeltaLiquidity;
    uint usedDeltaLiquidity;
    uint NAV;
  }
  function getLiquidity(uint spotPrice) external view returns (Liquidity memory);
}

interface IOptionMarketPricer {
    struct VegaUtilFeeComponents {
        int preTradeAmmNetStdVega;
        int postTradeAmmNetStdVega;
        uint vegaUtil;
        uint volTraded;
        uint NAV;
        uint vegaUtilFee;
    }

      struct VarianceFeeComponents {
        uint varianceFeeCoefficient;
        uint vega;
        uint vegaCoefficient;
        uint skew;
        uint skewCoefficient;
        uint ivVariance;
        uint ivVarianceCoefficient;
        uint varianceFee;
    }

    struct TradeResult {
        uint amount;
        uint premium;
        uint optionPriceFee;
        uint spotPriceFee;
        VegaUtilFeeComponents vegaUtilFee;
        VarianceFeeComponents varianceFee;
        uint totalFee;
        uint totalCost;
        uint volTraded;
        uint newBaseIv;
        uint newSkew;
    }

    struct VolComponents {
        uint vol;
        uint baseIv;
        uint skew;
    }

    struct PricingParameters {
        uint optionPriceFeeCoefficient;
        uint optionPriceFee1xPoint;
        uint optionPriceFee2xPoint;
        uint spotPriceFeeCoefficient;
        uint spotPriceFee1xPoint;
        uint spotPriceFee2xPoint;
        uint vegaFeeCoefficient;
        uint standardSize;
        uint skewAdjustmentFactor;
    }

    function getTimeWeightedFee(
        uint expiry,
        uint pointA,
        uint pointB,
        uint coefficient
    ) external view returns (uint timeWeightedFee);
    function getPricingParams() external view returns (PricingParameters memory pricingParameters);
    function ivImpactForTrade(
        IOptionMarket.TradeParameters memory trade,
        uint boardBaseIv,
        uint strikeSkew
    ) external view returns (uint newBaseIv, uint newSkew);
    function getVegaUtilFee(
        IOptionMarket.TradeParameters memory trade, 
        IOptionGreekCache.TradePricing memory pricing
    ) external view returns (VegaUtilFeeComponents memory vegaUtilFeeComponents);
    function getVarianceFee(
        IOptionMarket.TradeParameters memory trade,
        IOptionGreekCache.TradePricing memory pricing,
        uint skew
    ) external view returns (VarianceFeeComponents memory varianceFeeComponents);
}

interface IOptionGreekCache {
    struct TradePricing {
        uint optionPrice;
        int preTradeAmmNetStdVega;
        int postTradeAmmNetStdVega;
        int callDelta;
        uint volTraded;
        uint ivVariance;
        uint vega;
    }
    struct GreekCacheParameters {
        uint maxStrikesPerBoard;
        uint acceptableSpotPricePercentMove;
        uint staleUpdateDuration;
        uint varianceIvGWAVPeriod;
        uint varianceSkewGWAVPeriod;
        uint optionValueIvGWAVPeriod;
        uint optionValueSkewGWAVPeriod;
        uint gwavSkewFloor;
        uint gwavSkewCap;
        int rateAndCarry;
    }
    struct NetGreeks {
        int netDelta;
        int netStdVega;
        int netOptionValue;
    }
    struct StrikeGreeks {
        int callDelta;
        int putDelta;
        uint stdVega;
        uint callPrice;
        uint putPrice;
    }

    struct OptionBoardCache {
        uint id;
        uint[] strikes;
        uint expiry;
        uint iv;
        NetGreeks netGreeks;
        uint updatedAt;
        uint updatedAtPrice;
        uint maxSkewVariance;
        uint ivVariance;
    }
    struct StrikeCache {
        uint id;
        uint boardId;
        uint strikePrice;
        uint skew;
        StrikeGreeks greeks;
        int callExposure; // long - short
        int putExposure; // long - short
        uint skewVariance; // (GWAVSkew - skew)
    }
    struct GlobalCache {
        uint minUpdatedAt;
        uint minUpdatedAtPrice;
        uint maxUpdatedAtPrice;
        uint maxSkewVariance;
        uint maxIvVariance;
        NetGreeks netGreeks;
    }
    struct BoardGreeksView {
        NetGreeks boardGreeks;
        uint ivGWAV;
        StrikeGreeks[] strikeGreeks;
        uint[] skewGWAVs;
    }

    function getStrikeCache(uint strikeId) external view returns (StrikeCache memory);
    function getSkewGWAV(uint strikeId, uint secondsAgo) external view returns (uint skewGWAV);
    function getOptionBoardCache(uint boardId) external view returns (OptionBoardCache memory);
    function getGreekCacheParams() external view returns (GreekCacheParameters memory);
    function getGlobalCache() external view returns (GlobalCache memory);
    function getBoardGreeksView(uint boardId) external view returns (BoardGreeksView memory);
}
