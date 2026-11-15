// SPDX-License-Identifier: MIT
// Test mocks — local-chain only, never deployed.
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract MockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// 测试网专用结算币（主网绝不部署；symbol 与真实 USDC 区分存在链上，仅测试网使用）
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin (test)", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// RH Stock 合规行为模拟：transfer/transferFrom 对 blocked 地址 revert Blocked（负向测试用）
contract MockStock is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("NVIDIA Robinhood Token mock", "NVDA-m") {}
    function decimals() public pure override returns (uint8) { return 18; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setBlocked(address a, bool v) external { blocked[a] = v; }
    function transfer(address to, uint256 value) public override returns (bool) {
        _requireUnblocked(msg.sender); _requireUnblocked(to);
        return super.transfer(to, value);
    }
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _requireUnblocked(from); _requireUnblocked(to); _requireUnblocked(msg.sender);
        return super.transferFrom(from, to, value);
    }
    function _requireUnblocked(address a) internal view { require(!blocked[a], "Blocked"); }
}

contract MockAggregator {
    int256 public answer = 10_000_000_000; // 100.00 USD (8 decimals)
    uint256 public updatedAt;
    constructor() { updatedAt = block.timestamp; }
    function setAnswer(int256 a) external { answer = a; }
    function setUpdatedAt(uint256 t) external { updatedAt = t; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, 0, updatedAt, 1);
    }
}

contract MockStockMultiplier is ERC20 {
    constructor() ERC20("stock ui-mock", "STK-m") {}
    function decimals() public pure override returns (uint8) { return 18; }
    function mint(address to, uint256 a) external { _mint(to, a); }
    function uiMultiplier() external pure returns (uint256) { return 1e18; }
}

/// UniswapV3Pool 行为模拟：回调拉入 tokenIn、按 outBps 支付 tokenOut
interface IUniswapV3SwapCallbackLike {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}

contract MockPool {
    address public immutable token0;
    address public immutable token1;
    uint256 public outBps = 9_900; // 默认 1% 池费
    mapping(address => uint256) public usd8; // 每代币 USD 价（8 位小数）

    constructor(address _t0, address _t1) { token0 = _t0; token1 = _t1; }
    function setOutBps(uint256 b) external { outBps = b; }
    function setUsd(address tok, uint256 price8) external { usd8[tok] = price8; }

    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata)
        external returns (int256 a0, int256 a1)
    {
        uint256 amountIn = uint256(amountSpecified);
        address inTok = zeroForOne ? token0 : token1;
        address outTok = zeroForOne ? token1 : token0;
        uint256 amountOut = _quote(inTok, outTok, amountIn);
        // 真实池通过回调让 trader 转入 tokenIn
        IUniswapV3SwapCallbackLike(msg.sender).uniswapV3SwapCallback(int256(amountIn), 0, abi.encode(inTok));
        ERC20(outTok).transfer(recipient, amountOut);
        a0 = zeroForOne ? int256(amountIn) : -int256(amountOut);
        a1 = zeroForOne ? -int256(amountOut) : int256(amountIn);
    }

    // out_raw = in_raw × usdIn/usdOut × 10^(outDec−inDec) × bps —— 价格感知报价
    function _quote(address inTok, address outTok, uint256 amountIn) internal view returns (uint256) {
        uint256 inDec = ERC20(inTok).decimals();
        uint256 outDec = ERC20(outTok).decimals();
        uint256 usdIn = usd8[inTok] == 0 ? 1e8 : usd8[inTok];
        uint256 usdOut = usd8[outTok] == 0 ? 1e8 : usd8[outTok];
        return Math.mulDiv(
            Math.mulDiv(amountIn, usdIn * outBps, usdOut * 10_000),
            10 ** outDec, 10 ** inDec
        );
    }
}

contract MockWETH is ERC20 {
    constructor() ERC20("Mock WETH", "WETH") {}
    function deposit() external payable { _mint(msg.sender, msg.value); }
}
