// SPDX-License-Identifier: MIT
// Wage · DecisionLog / ModelRegistry / DecisionExecutor — the graded loop, on chain.
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WageTaskBoard} from "./WageTaskBoard.sol";

/* ─────────────── DecisionLog — every verdict, immutable, with confidence ─────────────── */
contract WageDecisionLog is Ownable2Step {
    address public operator;
    uint256 public nextId = 1;

    struct Decision {
        uint256 id;
        uint256 taskId;
        uint8 kind;            // 1=hire 2=grade 3=refund
        uint16 confidenceBps;  // grader's certainty, 0–10000
        uint16 thresholdBps;   // the rule in force at decision time
        bytes32 reasoningHash; // content-addressed reasoning, kept by the brain service
        address worker;
    }

    mapping(uint256 => Decision) public decisions;

    event DecisionRecorded(uint256 indexed id, uint256 indexed taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker);
    event OperatorSet(address indexed operator);

    error NotOperator();
    error ZeroAddress();
    error BadConfidence();

    constructor(address owner_, address operator_) Ownable(owner_) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function record(uint256 taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker)
        external returns (uint256 id)
    {
        if (msg.sender != operator) revert NotOperator();
        if (confidenceBps > 10_000 || thresholdBps > 10_000) revert BadConfidence();
        id = nextId++;
        decisions[id] = Decision(id, taskId, kind, confidenceBps, thresholdBps, reasoningHash, worker);
        emit DecisionRecorded(id, taskId, kind, confidenceBps, thresholdBps, reasoningHash, worker);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }
}

/* ─────────────── ModelRegistry — five seats, one employer ─────────────── */
contract WageModelRegistry is Ownable2Step {
    bytes32[5] public seats;               // model identity per desk
    address[5] public payouts;             // where accepted wages go
    bool[5] public active;
    mapping(address worker => uint8 desk) public deskOf;

    event SeatSet(uint8 indexed desk, bytes32 model, address payout, bool active);

    error BadDesk();
    error ZeroAddress();

    /// @dev Seats may start EMPTY (payout == address(0)) — a young market opens with
    /// fewer workers and fills seats later via setSeat. Empty seat = inactive, no payout.
    constructor(bytes32[5] memory models, address[5] memory payouts_, address owner_) Ownable(owner_) {
        for (uint8 i = 0; i < 5; i++) {
            seats[i] = models[i];
            payouts[i] = payouts_[i];
            bool live = payouts_[i] != address(0);
            active[i] = live;
            if (live) deskOf[payouts_[i]] = i + 1; // 1-based; 0 = not a seat
            emit SeatSet(i, models[i], payouts_[i], live);
        }
    }

    /// @dev payout == address(0) empties the seat (inactive). Active requires a payout address.
    function setSeat(uint8 desk, bytes32 model, address payout, bool isActive) external onlyOwner {
        if (desk >= 5) revert BadDesk();
        bool live = payout != address(0) && isActive;
        deskOf[payouts[desk]] = 0;
        seats[desk] = model;
        payouts[desk] = payout;
        active[desk] = live;
        if (live) deskOf[payout] = desk + 1;
        emit SeatSet(desk, model, payout, live);
    }

    function isActive(address worker) external view returns (bool) {
        uint8 deskPlus = deskOf[worker];
        if (deskPlus == 0) return false;
        return active[deskPlus - 1];
    }
}

/* ─────────────── DecisionExecutor — pays only accepted work ─────────────── */
contract WageDecisionExecutor is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable BOUNTY;
    WageTaskBoard public immutable board;
    WageModelRegistry public immutable registry;
    address public operator;   // the grader's key
    address public treasury;   // protocol fee receiver (on-chain param; never publicized on the site)
    uint16 public feeBps;      // ≤ MAX_FEE_BPS
    uint16 public thresholdBps = 1500; // the confidence rule in force

    mapping(uint256 taskId => bool) public settled;

    uint16 public constant MAX_FEE_BPS = 2000;

    event Settled(uint256 indexed taskId, address indexed worker, bool accepted, uint16 confidenceBps, uint96 toWorker, uint96 toPoster, uint96 fee);
    event OperatorSet(address indexed operator);
    event FeeSet(uint16 feeBps, address indexed treasury);
    event ThresholdSet(uint16 thresholdBps);

    error NotOperator();
    error ZeroAddress();
    error AlreadySettled();
    error NotHired();
    error BadFee();
    error InactiveWorker();
    error BadVerdict(); // accepted below the threshold — the rule says no
    error SettleFailed();

    constructor(IERC20 bounty_, WageTaskBoard board_, WageModelRegistry registry_, address owner_, address operator_, address treasury_) Ownable(owner_) {
        if (address(bounty_) == address(0) || operator_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        BOUNTY = bounty_;
        board = board_;
        registry = registry_;
        operator = operator_;
        treasury = treasury_;
        emit OperatorSet(operator_);
        emit FeeSet(0, treasury_);
    }

    /// Settle the verdict for a hired task. An accepted verdict must carry confidence ≥
    /// thresholdBps — below the bar the executor only takes the safe default: refund.
    function settle(uint256 taskId, bool accept, uint16 confidenceBps) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (settled[taskId]) revert AlreadySettled();
        (
            address poster, uint96 bounty, , , , address hired, bool refunded
        ) = board.tasks(taskId);
        if (hired == address(0)) revert NotHired();
        if (refunded) revert AlreadySettled();
        if (!registry.isActive(hired)) revert InactiveWorker();
        if (accept && confidenceBps < thresholdBps) revert BadVerdict();
        settled[taskId] = true;

        uint96 toWorker = 0;
        uint96 fee = 0;
        if (accept) {
            fee = uint96(uint256(bounty) * feeBps / 10_000);
            toWorker = bounty - fee;
            if (fee > 0) board.payout(taskId, treasury, fee);
            board.payout(taskId, hired, toWorker);
        } else {
            board.payout(taskId, poster, bounty);
        }
        emit Settled(taskId, hired, accept, confidenceBps, toWorker, accept ? 0 : bounty, fee);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setFee(uint16 feeBps_, address treasury_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS || treasury_ == address(0)) revert BadFee();
        feeBps = feeBps_;
        treasury = treasury_;
        emit FeeSet(feeBps_, treasury_);
    }

    function setThreshold(uint16 thresholdBps_) external onlyOwner {
        if (thresholdBps_ > 10_000) revert BadFee();
        thresholdBps = thresholdBps_;
        emit ThresholdSet(thresholdBps_);
    }
}
