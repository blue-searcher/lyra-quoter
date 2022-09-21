// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "openzeppelin-contracts-4.4.1/utils/math/SafeCast.sol";
import "./libraries/DecimalMath.sol";
import "./libraries/BlackScholes.sol";

import "./interfaces/ILyra.sol";

import "hardhat/console.sol";

contract LyraQuoter {
    using DecimalMath for uint256;

    ILyraRegister public register;
    ISynthetixAdapter internal synthetixAdapter;

    struct QuoteParameters {
        IOptionMarket optionMarket;
        IOptionGreekCache greekCache;
        IOptionMarketPricer optionPricer;
        IOptionMarket.Strike strike;
        IOptionMarket.OptionBoard board;
        uint256 timeToExpiryAnnualized;
        uint256 iterations;
        uint256 timeToExpiry;
        IOptionGreekCache.GlobalCache globalCache;
        IOptionGreekCache.GreekCacheParameters greekCacheParameters;
        IOptionMarket.TradeParameters trade;
        IOptionGreekCache.BoardGreeksView boardGreek;
        IOptionMarketPricer.TradeLimitParameters tradeLimitParams;
    }

    struct FeeParameters {
        uint256 volTraded;
        uint256 optionPrice;
        int256 preTradeAmmNetStdVega;
        int256 postTradeAmmNetStdVega;
        uint256 ivVariance;
        uint256 newSkew;
    }

    struct QuoteIterationResult {
        uint256 newBaseIv;
        uint256 newSkew;
        int256 postTradeAmmNetStdVega;
        uint256 fees;
        uint256 premium;
    }
    
    constructor(
        address _lyraRegister //0xF5A0442D4753cA1Ea36427ec071aa5E786dA5916
    ) {
        register = ILyraRegister(_lyraRegister);

        synthetixAdapter = ISynthetixAdapter(register.getGlobalAddress(bytes32("SYNTHETIX_ADAPTER")));
    }

    function _getTimeToExpiryAnnualized(IOptionMarket.OptionBoard memory board) internal view returns (uint256 timeToExpiryAnnualized) {
        uint256 timeToExpiry = max(0, board.expiry - block.timestamp);
        timeToExpiryAnnualized = timeToExpiry / (60 * 60 * 24 * 365);
    }

    function _isLong(IOptionMarket.OptionType optionType) internal pure returns (bool) {
        return (optionType == IOptionMarket.OptionType.LONG_CALL || optionType == IOptionMarket.OptionType.LONG_PUT);
    }

    function _composeQuote(
        IOptionMarket optionMarket,
        uint256 strikeId,
        uint256 iterations,
        IOptionMarket.OptionType optionType,
        uint256 amount,
        IOptionMarket.TradeDirection tradeDirection,
        bool isForceClose
    ) internal view returns (QuoteParameters memory quoteParameters) {
        if (strikeId == 0) {
            revert IOptionMarket.ExpectedNonZeroValue(address(this), IOptionMarket.NonZeroValues.STRIKE_ID);
        }
        if (iterations == 0) {
            revert IOptionMarket.ExpectedNonZeroValue(address(this), IOptionMarket.NonZeroValues.ITERATIONS);
        }

        ILyraRegister.OptionMarketAddresses memory marketAddresses = register.getMarketAddresses(optionMarket);

        IOptionMarket.Strike memory strike = optionMarket.getStrike(strikeId); 
        if (strike.id != strikeId) {
            revert IOptionMarket.InvalidStrikeId(address(this), strikeId);
        }

        IOptionMarket.OptionBoard memory board = optionMarket.getOptionBoard(strike.boardId); 
        uint256 boardToPriceAtExpiry = optionMarket.boardToPriceAtExpiry(board.id);
        if (boardToPriceAtExpiry != 0) {
            revert IOptionMarket.BoardAlreadySettled(address(this), board.id);
        }
        if (board.frozen) {
          revert IOptionMarket.BoardIsFrozen(address(this), board.id);
        }
        
        if (block.timestamp >= board.expiry) {
          revert IOptionMarket.BoardExpired(address(this), board.id, board.expiry, block.timestamp);
        }

        ISynthetixAdapter.ExchangeParams memory exchangeParams = synthetixAdapter.getExchangeParams(address(optionMarket));

        IOptionMarket.TradeParameters memory trade = IOptionMarket.TradeParameters({
            isBuy: (tradeDirection == IOptionMarket.TradeDirection.OPEN) ? _isLong(optionType) : !_isLong(optionType),
            isForceClose: isForceClose,
            tradeDirection: tradeDirection,
            optionType: optionType,
            amount: amount / iterations,
            expiry: board.expiry,
            strikePrice: strike.strikePrice,
            exchangeParams: exchangeParams,
            liquidity: marketAddresses.liquidityPool.getLiquidity(exchangeParams.spotPrice)
        });

        quoteParameters = QuoteParameters({
            optionMarket: optionMarket,
            greekCache: marketAddresses.greekCache,
            optionPricer: marketAddresses.optionMarketPricer,
            strike: strike,
            board: board,
            timeToExpiryAnnualized: _getTimeToExpiryAnnualized(board),
            timeToExpiry: max(0, board.expiry - block.timestamp),
            iterations: iterations,
            globalCache: marketAddresses.greekCache.getGlobalCache(),
            greekCacheParameters: marketAddresses.greekCache.getGreekCacheParams(),
            trade: trade,
            boardGreek: marketAddresses.greekCache.getBoardGreeksView(board.id),
            tradeLimitParams: marketAddresses.optionMarketPricer.tradeLimitParams()
        });
    }

    function _getOptionPrice(
        QuoteParameters memory params, 
        uint256 volTraded
    ) internal pure returns (uint256) {
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

    function _getOptionPriceFee(
        IOptionMarketPricer pricer, 
        IOptionMarket.OptionBoard memory board, 
        uint256 pricePerOption, 
        uint256 size
    ) internal view returns (uint256) {
        IOptionMarketPricer.PricingParameters memory pricingParams = pricer.getPricingParams();

        uint256 timeWeightedOptionPriceFee = pricer.getTimeWeightedFee(
            board.expiry,
            pricingParams.optionPriceFee1xPoint,
            pricingParams.optionPriceFee2xPoint,
            pricingParams.optionPriceFeeCoefficient
        );

        return timeWeightedOptionPriceFee.multiplyDecimal(size).multiplyDecimal(pricePerOption);
    }

    function _getSpotPriceFee(
        IOptionMarketPricer pricer, 
        IOptionMarket.OptionBoard memory board, 
        uint256 size, 
        uint256 spotPrice
    ) internal view returns (uint256) {
        IOptionMarketPricer.PricingParameters memory pricingParams = pricer.getPricingParams();

        uint256 timeWeightedSpotPriceFee = pricer.getTimeWeightedFee(
            board.expiry,
            pricingParams.spotPriceFee1xPoint,
            pricingParams.spotPriceFee2xPoint,
            pricingParams.spotPriceFeeCoefficient
        );

        return timeWeightedSpotPriceFee.multiplyDecimal(size).multiplyDecimal(spotPrice);
    }

    function _getOtherFees(
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
        IOptionMarketPricer.VegaUtilFeeComponents memory vegaUtilFeeComps = quoterParams.optionPricer.getVegaUtilFee(quoterParams.trade, pricing);
        IOptionMarketPricer.VarianceFeeComponents memory varianceFeeComps = quoterParams.optionPricer.getVarianceFee(quoterParams.trade, pricing, params.newSkew);

        vegaFee = vegaUtilFeeComps.vegaUtilFee;
        varianceFee = varianceFeeComps.varianceFee;
    }

    function _getTotalFee(
        FeeParameters memory feeParams,
        QuoteParameters memory quoteParams
    ) internal view returns (uint256 fees) {
        uint256 optionPriceFee = _getOptionPriceFee(quoteParams.optionPricer, quoteParams.board, feeParams.optionPrice, quoteParams.trade.amount);
        uint256 spotPriceFee = _getSpotPriceFee(quoteParams.optionPricer, quoteParams.board, quoteParams.trade.amount, quoteParams.trade.exchangeParams.spotPrice);

        (uint256 vegaFee, uint256 varianceFee) = _getOtherFees(quoteParams, feeParams);

        fees = optionPriceFee + spotPriceFee + vegaFee + varianceFee;
    }

    function _getForceClosePrice(
        QuoteParameters memory params, 
        uint256 volTraded
    ) internal view returns (uint256 price, uint256 vol) {
        bool isPostCutoff = block.timestamp + params.tradeLimitParams.tradingCutoff > params.board.expiry;

        (price, vol) = params.greekCache.getPriceForForceClose(
            params.trade, 
            params.strike, 
            params.board.expiry, 
            volTraded,
            isPostCutoff
        );
    }

    function _checkIteration(
        QuoteParameters memory params, 
        uint256 baseIv, 
        uint256 newBaseIv,
        uint256 newSkew
    ) internal view {
        bool isPostCutoff = block.timestamp + params.tradeLimitParams.tradingCutoff > params.board.expiry;

        if (params.trade.isForceClose) {
            newBaseIv = baseIv;

            if (newSkew <= params.tradeLimitParams.absMinSkew || newSkew >= params.tradeLimitParams.absMaxSkew) {
                revert IOptionMarketPricer.ForceCloseSkewOutOfRange(
                    address(this),
                    params.trade.isBuy,
                    newSkew,
                    params.tradeLimitParams.absMinSkew,
                    params.tradeLimitParams.absMaxSkew
                );
            }
        } else {
            if (isPostCutoff) {
                revert IOptionMarketPricer.TradingCutoffReached(
                    address(this), 
                    params.tradeLimitParams.tradingCutoff, 
                    params.board.expiry, 
                    block.timestamp
                );
            }

            uint256 newVol = newBaseIv.multiplyDecimal(newSkew);

            if (params.trade.isBuy) {
                if (newVol > params.tradeLimitParams.maxVol || 
                    newBaseIv > params.tradeLimitParams.maxBaseIV ||
                    newSkew > params.tradeLimitParams.maxSkew
                ) {
                    revert IOptionMarketPricer.VolSkewOrBaseIvOutsideOfTradingBounds(
                        address(this),
                        params.trade.isBuy,
                        IOptionMarketPricer.VolComponents(params.board.iv.multiplyDecimal(params.strike.skew), params.board.iv, params.strike.skew),
                        IOptionMarketPricer.VolComponents(newVol, newBaseIv, newSkew),
                        IOptionMarketPricer.VolComponents(params.tradeLimitParams.maxVol, params.tradeLimitParams.maxBaseIV, params.tradeLimitParams.maxSkew)
                    );
                }
            } else {
                if (newVol < params.tradeLimitParams.minVol ||
                    newBaseIv < params.tradeLimitParams.minBaseIV ||
                    newSkew < params.tradeLimitParams.minSkew
                ) {
                    revert IOptionMarketPricer.VolSkewOrBaseIvOutsideOfTradingBounds(
                        address(this),
                        params.trade.isBuy,
                        IOptionMarketPricer.VolComponents(params.board.iv.multiplyDecimal(params.strike.skew), params.board.iv, params.strike.skew),
                        IOptionMarketPricer.VolComponents(newVol, newBaseIv, newSkew),
                        IOptionMarketPricer.VolComponents(params.tradeLimitParams.minVol, params.tradeLimitParams.minBaseIV, params.tradeLimitParams.minSkew)
                    );
                }
            }
        }

        BlackScholes.PricesDeltaStdVega memory pricesDeltaStdVega = BlackScholes.pricesDeltaStdVega(BlackScholes.BlackScholesInputs({
            timeToExpirySec: params.timeToExpiry,
            volatilityDecimal: newBaseIv.multiplyDecimal(newSkew), //correct to use new values?
            spotDecimal: params.trade.exchangeParams.spotPrice,
            strikePriceDecimal: params.strike.strikePrice,
            rateDecimal: params.greekCacheParameters.rateAndCarry
        }));

        if (params.trade.isForceClose) {
            if (!isPostCutoff) {
                if (pricesDeltaStdVega.callDelta > params.tradeLimitParams.minForceCloseDelta && 
                    pricesDeltaStdVega.callDelta < (int(DecimalMath.UNIT) - params.tradeLimitParams.minForceCloseDelta)
                ) {
                    revert IOptionMarketPricer.ForceCloseDeltaOutOfRange(
                        address(this),
                        pricesDeltaStdVega.callDelta,
                        params.tradeLimitParams.minForceCloseDelta,
                        (int(DecimalMath.UNIT) - params.tradeLimitParams.minForceCloseDelta)
                    );
                }
            }
        }
        else {
            if (pricesDeltaStdVega.callDelta < params.tradeLimitParams.minDelta ||
                pricesDeltaStdVega.callDelta > int(DecimalMath.UNIT) - params.tradeLimitParams.minDelta
            ) {
                revert IOptionMarketPricer.TradeDeltaOutOfRange(
                    address(this),
                    pricesDeltaStdVega.callDelta,
                    params.tradeLimitParams.minDelta,
                    int(DecimalMath.UNIT) - params.tradeLimitParams.minDelta
                );
            }
        }
    }

    function _quoteIteration(
        uint256 baseIv, 
        uint256 skew, 
        QuoteParameters memory params, 
        int256 preTradeAmmNetStdVega
    ) internal view returns (QuoteIterationResult memory iterationResult) {
        (iterationResult.newBaseIv, iterationResult.newSkew) = params.optionPricer.ivImpactForTrade(params.trade, baseIv, skew);

        _checkIteration(
            params, 
            baseIv, 
            iterationResult.newBaseIv, 
            iterationResult.newSkew
        );

        uint256 volTraded = iterationResult.newBaseIv.multiplyDecimal(iterationResult.newSkew);
        uint256 optionPrice;

        if (params.trade.isForceClose) {
            (optionPrice, volTraded) = _getForceClosePrice(params, volTraded);
            iterationResult.newBaseIv = baseIv;
        }
        else {
            optionPrice = _getOptionPrice(params, volTraded);
        }

        uint256 ivVariance = abs(int256(params.boardGreek.ivGWAV) - int256(iterationResult.newBaseIv));

        int256 netStdVegaDiff = params.globalCache.netGreeks.netStdVega * int256(params.trade.amount) * (params.trade.isBuy ? int256(1) : int256(-1)) / 10e18;
        iterationResult.postTradeAmmNetStdVega = preTradeAmmNetStdVega + netStdVegaDiff;

        FeeParameters memory feeParams = FeeParameters({
            volTraded: volTraded,
            optionPrice: optionPrice,
            preTradeAmmNetStdVega: preTradeAmmNetStdVega,
            postTradeAmmNetStdVega: iterationResult.postTradeAmmNetStdVega,
            ivVariance: ivVariance,
            newSkew: iterationResult.newSkew
        });

        iterationResult.fees = _getTotalFee(feeParams, params);

        uint256 base = optionPrice.multiplyDecimal(params.trade.amount);

        iterationResult.premium = params.trade.isBuy ? (base + iterationResult.fees) : (iterationResult.fees < base ? (base - iterationResult.fees) : 0);
    }

    function quote(
        IOptionMarket _optionMarket,
        uint256 strikeId,
        uint256 iterations,
        IOptionMarket.OptionType optionType,
        uint256 amount,
        bool isForceClose
    ) public view returns (uint256 totalPremium, uint256 totalFee) {
        QuoteParameters memory params = _composeQuote(
            _optionMarket,
            strikeId, 
            iterations, 
            optionType, 
            amount, 
            IOptionMarket.TradeDirection.OPEN, 
            isForceClose
        );

        int256 preTradeAmmNetStdVega = params.globalCache.netGreeks.netStdVega * (-1);

        uint256 baseIv = params.board.iv;
        uint256 skew = params.strike.skew;

        for (uint256 i = 0; i < params.iterations; i++) {
            QuoteIterationResult memory iterationResult = _quoteIteration(
                baseIv, 
                skew, 
                params, 
                preTradeAmmNetStdVega
            );

            baseIv = iterationResult.newBaseIv;
            skew = iterationResult.newSkew;
            preTradeAmmNetStdVega = iterationResult.postTradeAmmNetStdVega;

            totalPremium = totalPremium + iterationResult.premium;
            totalFee = totalFee + iterationResult.fees;
        }
    }

    function fullQuotes(
        IOptionMarket _optionMarket,
        uint256 strikeId,
        uint256 iterations,
        uint256 amount
    ) external view returns (uint256[] memory, uint256[] memory) {
        uint256[] memory totalPremiums = new uint256[](5);
        uint256[] memory totalFees = new uint256[](5);

        (totalPremiums[0], totalFees[0]) = quote(_optionMarket, strikeId, iterations, IOptionMarket.OptionType.LONG_CALL, amount, false);
        (totalPremiums[1], totalFees[1]) = quote(_optionMarket, strikeId, iterations, IOptionMarket.OptionType.LONG_PUT, amount, false);
        (totalPremiums[2], totalFees[2]) = quote(_optionMarket, strikeId, iterations, IOptionMarket.OptionType.SHORT_CALL_BASE, amount, false);
        (totalPremiums[3], totalFees[3]) = quote(_optionMarket, strikeId, iterations, IOptionMarket.OptionType.SHORT_CALL_QUOTE, amount, false);
        (totalPremiums[4], totalFees[4]) = quote(_optionMarket, strikeId, iterations, IOptionMarket.OptionType.SHORT_PUT_QUOTE, amount, false);

        return (totalPremiums, totalFees);
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function abs(int val) internal pure returns (uint) {
        return uint(val < 0 ? -val : val);
    }
}