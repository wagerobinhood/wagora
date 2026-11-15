// SPDX-License-Identifier: MIT
// Wage · TaskBoard — escrowed bounties for the agent labor market (Robinhood Chain).
// 设计参照源站已验证机制（1 USDG/任务、托管、验收放款、拒付退款）；实现为本项目原创。
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract WageTaskBoard is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable BOUNTY;      // USDG (6 decimals)
    address public operator;             // the grader's key
    address public executor;             // the settlement contract
    uint64 public deadlineWindow = 2 hours;
    uint256 public minBounty = 1e6;      // 1.00 USDG

    struct Task {
        address poster;
        uint96 bounty;
        bytes32 briefHash;
        uint64 postedAt;
        uint64 deadline;
        address hired;
        bool refunded;
    }

    uint256 public nextTaskId = 1;
    mapping(uint256 => Task) public tasks;
    mapping(uint256 => uint96) public paidOut;

    event Posted(uint256 indexed taskId, address indexed poster, uint96 bounty, bytes32 briefHash, uint64 deadline);
    event Hired(uint256 indexed taskId, address indexed worker);
    event Refunded(uint256 indexed taskId, address indexed poster, uint96 bounty);
    event Payout(uint256 indexed taskId, address indexed to, uint96 amount);
    event OperatorSet(address indexed operator);
    event ExecutorSet(address indexed executor);
    event ConfigSet(uint64 deadlineWindow, uint256 minBounty);

    error ZeroAmount();
    error ZeroAddress();
    error BelowMinBounty();
    error NotPoster();
    error AlreadyHired();
    error NotOperator();
    error NotExecutor();
    error AlreadySettled();
    error DeadlineNotPassed();
    error EmptyBrief();
    error OverCap();
    error NotHired();

    constructor(IERC20 bounty_, address owner_, address operator_) Ownable(owner_) {
        if (address(bounty_) == address(0) || operator_ == address(0)) revert ZeroAddress();
        BOUNTY = bounty_;
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function post(string calldata brief, uint96 bounty) external nonReentrant returns (uint256 taskId) {
        if (bounty < minBounty) revert BelowMinBounty();
        if (bytes(brief).length == 0) revert EmptyBrief();
        taskId = nextTaskId++;
        Task storage t = tasks[taskId];
        t.poster = msg.sender;
        t.bounty = bounty;
        t.briefHash = keccak256(bytes(brief));
        t.postedAt = uint64(block.timestamp);
        t.deadline = uint64(block.timestamp) + deadlineWindow;
        BOUNTY.safeTransferFrom(msg.sender, address(this), bounty); // escrow
        emit Posted(taskId, msg.sender, bounty, t.briefHash, t.deadline);
    }

    /// The grader hires one worker for the task; the escrow stays locked until the verdict.
    function hire(uint256 taskId, address worker) external {
        if (msg.sender != operator) revert NotOperator();
        Task storage t = tasks[taskId];
        if (t.hired != address(0)) revert AlreadyHired();
        if (t.refunded) revert AlreadySettled();
        if (worker == address(0)) revert ZeroAddress();
        t.hired = worker;
        emit Hired(taskId, worker);
    }

    /// Poster cancels once the task expired un-hired: full refund. After a hire only the executor moves funds.
    function refund(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (t.poster != msg.sender) revert NotPoster();
        if (t.hired != address(0)) revert AlreadyHired();
        if (t.refunded) revert AlreadySettled();
        if (block.timestamp < t.deadline) revert DeadlineNotPassed(); // cancel = expire path only
        t.refunded = true;
        BOUNTY.safeTransfer(t.poster, t.bounty);
        emit Refunded(taskId, t.poster, t.bounty);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    /// The settlement contract drains escrowed bounties; nothing else can move them after a hire.
    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    /// Executor-only payout channel. Partial payouts up to the bounty; full drain closes the task.
    function payout(uint256 taskId, address to, uint96 amount) external nonReentrant {
        if (msg.sender != executor) revert NotExecutor();
        Task storage t = tasks[taskId];
        if (t.hired == address(0)) revert NotHired();
        if (t.refunded) revert AlreadySettled();
        if (amount == 0 || paidOut[taskId] + amount > t.bounty) revert OverCap();
        paidOut[taskId] += amount;
        BOUNTY.safeTransfer(to, amount);
        emit Payout(taskId, to, amount);
        if (paidOut[taskId] == t.bounty) t.refunded = true;
    }

    function setConfig(uint64 deadlineWindow_, uint256 minBounty_) external onlyOwner {
        deadlineWindow = deadlineWindow_;
        minBounty = minBounty_;
        emit ConfigSet(deadlineWindow_, minBounty_);
    }

    function escrow() external view returns (uint256) {
        return IERC20(BOUNTY).balanceOf(address(this));
    }
}
