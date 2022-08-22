// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "openzeppelin-contracts-4.4.1/utils/math/SafeCast.sol";
import "./libraries/DecimalMath.sol";
import "./libraries/BlackScholes.sol";

import "./interfaces/ILyra.sol";

contract LyraQuoter {
    using DecimalMath for uint256;

    IOptionMarket public optionMarket;
    IOptionMarketPricer public optionPricer;

    ISynthetixAdapter internal synthetixAdapter;
    ILiquidityPool internal liquidityPool;
    IOptionGreekCache internal greekCache;

    struct QuoteParameters {
        IOptionMarket.Strike strike;
        IOptionMarket.OptionBoard board;
        uint256 timeToExpiryAnnualized;
        uint256 iterations;
        uint256 timeToExpiry;
        IOptionGreekCache.GlobalCache globalCache;
        IOptionGreekCache.GreekCacheParameters greekCacheParameters;
        IOptionMarket.TradeParameters trade;
        IOptionGreekCache.BoardGreeksView boardGreek;
    }

    struct FeeParameters {
        uint256 volTraded;
        uint256 optionPrice;
        int256 preTradeAmmNetStdVega;
        int256 postTradeAmmNetStdVega;
        uint256 ivVariance;
        uint256 newSkew;
    }
    
    constructor(
        address _optionMarket, //0x1d42a98848e022908069c2c545aE44Cc78509Bc8
        address _synthetixAdapter, //0xbfa31380ED380cEb325153eA08f296A45A489108
        address _liquidityPool, // 0x5Db73886c4730dBF3C562ebf8044E19E8C93843e
        address _optionPricer, // 0x73b161f1bcF37048A5173619cda53aaa56A28Be0
        address _greekCache //0xbb3e8Eac35e649ed1071A9Ec42223d474e67b19A
    ) {
        optionMarket = IOptionMarket(_optionMarket);
        synthetixAdapter = ISynthetixAdapter(_synthetixAdapter);
        liquidityPool = ILiquidityPool(_liquidityPool);
        optionPricer = IOptionMarketPricer(_optionPricer);
        greekCache = IOptionGreekCache(_greekCache);
    }

    function getTimeToExpiryAnnualized(IOptionMarket.OptionBoard memory board) internal view returns (uint256 timeToExpiryAnnualized) {
        uint256 timeToExpiry = max(0, board.expiry - block.timestamp);
        timeToExpiryAnnualized = timeToExpiry / (60 * 60 * 24 * 365);
    }

    function isLong(IOptionMarket.OptionType optionType) internal pure returns (bool) {
        return (optionType == IOptionMarket.OptionType.LONG_CALL || optionType == IOptionMarket.OptionType.LONG_PUT);
    }

    function composeQuote(
        uint256 strikeId,
        uint256 iterations,
        IOptionMarket.OptionType optionType,
        uint256 amount,
        IOptionMarket.TradeDirection tradeDirection,
        bool isForceClose
    ) internal view returns (QuoteParameters memory quoteParameters) {
        IOptionMarket.Strike memory strike = optionMarket.getStrike(strikeId); 
        IOptionMarket.OptionBoard memory board = optionMarket.getOptionBoard(strike.boardId); 

        IOptionGreekCache.BoardGreeksView memory boardGreek = greekCache.getBoardGreeksView(board.id);

        ISynthetixAdapter.ExchangeParams memory exchangeParams = synthetixAdapter.getExchangeParams(address(optionMarket));

        IOptionGreekCache.GreekCacheParameters memory greekCacheParameters = greekCache.getGreekCacheParams();
        IOptionGreekCache.GlobalCache memory globalCache = greekCache.getGlobalCache();

        bool isBuy = (tradeDirection == IOptionMarket.TradeDirection.OPEN) ? isLong(optionType) : !isLong(optionType);

        IOptionMarket.TradeParameters memory trade = IOptionMarket.TradeParameters({
            isBuy: isBuy,
            isForceClose: isForceClose,
            tradeDirection: tradeDirection,
            optionType: optionType,
            amount: amount / iterations,
            expiry: board.expiry,
            strikePrice: strike.strikePrice,
            exchangeParams: exchangeParams,
            liquidity: liquidityPool.getLiquidity(exchangeParams.spotPrice)
        });

        quoteParameters = QuoteParameters({
            strike: strike,
            board: board,
            timeToExpiryAnnualized: getTimeToExpiryAnnualized(board),
            timeToExpiry: max(0, board.expiry - block.timestamp),
            iterations: iterations,
            globalCache: globalCache,
            greekCacheParameters: greekCacheParameters,
            trade: trade,
            boardGreek: boardGreek
        });
    }

    function getOptionPrice(QuoteParameters memory params, uint256 volTraded) internal view returns (uint256) {
        (uint256 call, uint256 put) = BlackScholes.optionPrices(BlackScholes.BlackScholesInputs({
            timeToExpirySec: params.timeToExpiry,
            volatilityDecimal: volTraded,
            spotDecimal: params.trade.exchangeParams.spotPrice,
            strikePriceDecimal: params.strike.strikePrice,
            rateDecimal: params.greekCacheParameters.rateAndCarry
        })); 

        return (params.trade.optionType == IOptionMarket.OptionType.LONG_PUT 
            || params.trade.optionType == IOptionMarket.OptionType.SHORT_PUT_QUOTE) ? put : call;
    }

    function getOptionPriceFee(IOptionMarket.OptionBoard memory board, uint256 pricePerOption, uint256 size) internal view returns (uint256) {
        IOptionMarketPricer.PricingParameters memory pricingParams = optionPricer.getPricingParams();

        uint256 timeWeightedOptionPriceFee = optionPricer.getTimeWeightedFee(
            board.expiry,
            pricingParams.optionPriceFee1xPoint,
            pricingParams.optionPriceFee2xPoint,
            pricingParams.optionPriceFeeCoefficient
        );

        return timeWeightedOptionPriceFee.multiplyDecimal(size).multiplyDecimal(pricePerOption);
    }

    function getSpotPriceFee(IOptionMarket.OptionBoard memory board, uint256 size, uint256 spotPrice) internal view returns (uint256) {
        IOptionMarketPricer.PricingParameters memory pricingParams = optionPricer.getPricingParams();

        uint256 timeWeightedSpotPriceFee = optionPricer.getTimeWeightedFee(
            board.expiry,
            pricingParams.spotPriceFee1xPoint,
            pricingParams.spotPriceFee2xPoint,
            pricingParams.spotPriceFeeCoefficient
        );

        return timeWeightedSpotPriceFee.multiplyDecimal(size).multiplyDecimal(spotPrice);
    }

    function getOtherFees(
        QuoteParameters memory quoterParams, 
        FeeParameters memory params
    ) internal view returns (uint256 vegaFee, uint256 varianceFee) {
        uint256 vegaDecimal = BlackScholes.vega(BlackScholes.BlackScholesInputs({
            timeToExpirySec: quoterParams.timeToExpiry,
            volatilityDecimal: params.volTraded, 
            spotDecimal: quoterParams.trade.exchangeParams.spotPrice,
            strikePriceDecimal: quoterParams.strike.strikePrice,
            rateDecimal: quoterParams.greekCacheParameters.rateAndCarry
        }));

        IOptionGreekCache.TradePricing memory pricing = IOptionGreekCache.TradePricing({
            optionPrice: params.optionPrice,
            preTradeAmmNetStdVega: params.preTradeAmmNetStdVega,
            postTradeAmmNetStdVega: params.postTradeAmmNetStdVega,
            callDelta: 0, //Not used on below functions
            volTraded: params.volTraded,
            ivVariance: params.ivVariance,
            vega: vegaDecimal
        });
        IOptionMarketPricer.VegaUtilFeeComponents memory vegaUtilFeeComps = optionPricer.getVegaUtilFee(quoterParams.trade, pricing);
        IOptionMarketPricer.VarianceFeeComponents memory varianceFeeComps = optionPricer.getVarianceFee(quoterParams.trade, pricing, params.newSkew);

        vegaFee = vegaUtilFeeComps.vegaUtilFee;
        varianceFee = varianceFeeComps.varianceFee;
    }

    function getTotalFee(
        FeeParameters memory feeParams,
        QuoteParameters memory quoteParams
    ) internal view returns (uint256 fees) {
        uint256 optionPriceFee = getOptionPriceFee(quoteParams.board, feeParams.optionPrice, quoteParams.trade.amount);
        uint256 spotPriceFee = getSpotPriceFee(quoteParams.board, quoteParams.trade.amount, quoteParams.trade.exchangeParams.spotPrice);

        (uint256 vegaFee, uint256 varianceFee) = getOtherFees(quoteParams, feeParams);

        fees = optionPriceFee + spotPriceFee + vegaFee + varianceFee;
    }

    function quoteIteration(
        uint256 baseIv, 
        uint256 skew, 
        QuoteParameters memory params, 
        int256 preTradeAmmNetStdVega
    ) internal view returns (
        uint256 newBaseIv,
        uint256 newSkew,
        int256 postTradeAmmNetStdVega,
        uint256 fees,
        uint256 premium
    ) {
        (newBaseIv, newSkew) = optionPricer.ivImpactForTrade(params.trade, baseIv, skew);

        uint256 volTraded = newBaseIv.multiplyDecimal(newSkew);

        uint256 optionPrice = getOptionPrice(params, volTraded);
        uint256 ivVariance = abs(int256(params.boardGreek.ivGWAV) - int256(newBaseIv));

        int256 netStdVegaDiff = params.globalCache.netGreeks.netStdVega * int256(params.trade.amount) * (params.trade.isBuy ? int256(1) : int256(-1)) / 10e18;
        postTradeAmmNetStdVega = preTradeAmmNetStdVega + netStdVegaDiff;

        FeeParameters memory feeParams = FeeParameters({
            volTraded: volTraded,
            optionPrice: optionPrice,
            preTradeAmmNetStdVega: preTradeAmmNetStdVega,
            postTradeAmmNetStdVega: postTradeAmmNetStdVega,
            ivVariance: ivVariance,
            newSkew: newSkew
        });

        fees = getTotalFee(feeParams, params);

        uint256 base = optionPrice.multiplyDecimal(params.trade.amount);

        premium = params.trade.isBuy ? (base + fees) : (fees < base ? (base - fees) : 0);
    }

    function quote(
        uint256 strikeId,
        uint256 iterations,
        IOptionMarket.OptionType optionType,
        uint256 amount
    ) public view returns (uint256 totalPremium, uint256 totalFee) {
        QuoteParameters memory params = composeQuote(
            strikeId, 
            iterations, 
            optionType, 
            amount, 
            IOptionMarket.TradeDirection.OPEN, 
            false
        );

        int256 preTradeAmmNetStdVega = params.globalCache.netGreeks.netStdVega * (-1);

        uint256 baseIv = params.board.iv;
        uint256 skew = params.strike.skew;

        for (uint256 i = 0; i < params.iterations; i++) {
            (uint256 newBaseIv,
                uint256 newSkew,
                int256 postTradeAmmNetStdVega,
                uint256 fee,
                uint256 premium) = quoteIteration(baseIv, skew, params, preTradeAmmNetStdVega);

            baseIv = newBaseIv;
            skew = newSkew;
            preTradeAmmNetStdVega = postTradeAmmNetStdVega;

            totalPremium = totalPremium + premium;
            totalFee = totalFee + fee;
        }
    }

    function fullQuotes(
        uint256 strikeId,
        uint256 iterations,
        uint256 amount
    ) external view returns (uint256[] memory, uint256[] memory) {
        uint256[] memory totalPremiums = new uint256[](5);
        uint256[] memory totalFees = new uint256[](5);

        (totalPremiums[0], totalFees[0]) = quote(strikeId, iterations, IOptionMarket.OptionType.LONG_CALL, amount);
        (totalPremiums[1], totalFees[1]) = quote(strikeId, iterations, IOptionMarket.OptionType.LONG_PUT, amount);
        (totalPremiums[2], totalFees[2]) = quote(strikeId, iterations, IOptionMarket.OptionType.SHORT_CALL_BASE, amount);
        (totalPremiums[3], totalFees[3]) = quote(strikeId, iterations, IOptionMarket.OptionType.SHORT_CALL_QUOTE, amount);
        (totalPremiums[4], totalFees[4]) = quote(strikeId, iterations, IOptionMarket.OptionType.SHORT_PUT_QUOTE, amount);

        return (totalPremiums, totalFees);
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function abs(int val) internal pure returns (uint) {
        return uint(val < 0 ? -val : val);
    }
}