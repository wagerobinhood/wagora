const { expect } = require("chai");
const { ethers } = require("hardhat");

/* Wage 合约套件 · 本地链全量测试（正向 + 逆向）
   参数对齐源站已验证值：interval 1h · premiumBps 200 · maxBuyBps 5000 · maxFeedAge 3d */

const DEPLOY = async () => {
  const [owner, operator, treasury, poster, worker1, worker2, worker3, worker4, worker5, other] =
    await ethers.getSigners();

  const MockUSDG = await ethers.getContractFactory("MockUSDG");
  const usdg = await MockUSDG.deploy();

  const MockWETH = await ethers.getContractFactory("MockWETH");
  const weth = await MockWETH.deploy();

  const MockPool = await ethers.getContractFactory("MockPool");
  const wethPool = await MockPool.deploy(await weth.getAddress(), await usdg.getAddress());

  const WageTaskBoard = await ethers.getContractFactory("WageTaskBoard");
  const board = await WageTaskBoard.deploy(await usdg.getAddress(), owner.address, operator.address);

  const WageDecisionLog = await ethers.getContractFactory("WageDecisionLog");
  const log = await WageDecisionLog.deploy(owner.address, operator.address);

  const models = [ethers.id("CLAUDE"), ethers.id("GPT"), ethers.id("GEMINI"), ethers.id("GROK"), ethers.id("DEEPSEEK")];
  const payouts = [worker1.address, worker2.address, worker3.address, worker4.address, worker5.address];
  const WageModelRegistry = await ethers.getContractFactory("WageModelRegistry");
  const registry = await WageModelRegistry.deploy(models, payouts, owner.address);

  const WageDecisionExecutor = await ethers.getContractFactory("WageDecisionExecutor");
  const executor = await WageDecisionExecutor.deploy(
    await usdg.getAddress(), await board.getAddress(), await registry.getAddress(),
    owner.address, operator.address, treasury.address);

  await board.setExecutor(await executor.getAddress());
  const MockStockMultiplier = await ethers.getContractFactory("MockStockMultiplier");
  const stock = await MockStockMultiplier.deploy();
  const MockAggregator = await ethers.getContractFactory("MockAggregator");
  const feed = await MockAggregator.deploy();
  const stockPool = await MockPool.deploy(await usdg.getAddress(), await stock.getAddress());

  const WageDeskMandate = await ethers.getContractFactory("WageDeskMandate");
  const mandate = await WageDeskMandate.deploy(
    await usdg.getAddress(), await weth.getAddress(), await wethPool.getAddress(),
    owner.address, operator.address, models);

  // venue: stock 池（token0=USDG, token1=stock）
  await mandate.setVenue(await stock.getAddress(), await stockPool.getAddress(), await feed.getAddress(), true);

  // 池子库存（mock 池必须真的持有输出代币）+ 价格表
  await stock.mint(await stockPool.getAddress(), ethers.parseEther("1000000"));
  await usdg.mint(await wethPool.getAddress(), ethers.parseUnits("1000000", 6));
  await stockPool.setUsd(await usdg.getAddress(), 1e8);            // USDG = $1.00
  await stockPool.setUsd(await stock.getAddress(), 1e10);          // stock = $100.00
  await wethPool.setUsd(await usdg.getAddress(), 1e8);
  // fund: 给每个 desk 充 100 USDG
  await usdg.mint(owner.address, ethers.parseUnits("10000", 6));
  for (let d = 0; d < 5; d++) {
    await usdg.approve(await mandate.getAddress(), ethers.parseUnits("100", 6));
    await mandate.fund(d, ethers.parseUnits("100", 6));
  }
  // poster 有赏金并授权
  await usdg.mint(poster.address, ethers.parseUnits("1000", 6));
  await usdg.connect(poster).approve(await board.getAddress(), ethers.parseUnits("1000", 6));

  return { owner, operator, treasury, poster, worker1, worker2, worker3, worker4, worker5, other,
    usdg, weth, wethPool, board, log, registry, executor, stock, feed, stockPool, mandate };
};

const postTask = async (board, poster, bounty = "1") =>
  board.connect(poster).post("summarize three filings", ethers.parseUnits(bounty, 6));

const bump = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

describe("WageTaskBoard", () => {
  it("P: post 托管赏金（escrow 增加到账）", async () => {
    const { board, usdg, poster } = await DEPLOY();
    await postTask(board, poster);
    expect(await board.escrow()).to.eq(ethers.parseUnits("1", 6));
    expect(await usdg.balanceOf(await board.getAddress())).to.eq(ethers.parseUnits("1", 6));
  });

  it("P: post 发出 Posted 事件", async () => {
    const { board, poster } = await DEPLOY();
    await expect(postTask(board, poster))
      .to.emit(board, "Posted");
  });

  it("N: 低于最小赏金 → BelowMinBounty", async () => {
    const { board, poster } = await DEPLOY();
    await expect(board.connect(poster).post("x", ethers.parseUnits("0.5", 6)))
      .to.be.revertedWithCustomError(board, "BelowMinBounty");
  });

  it("N: 空 brief → EmptyBrief", async () => {
    const { board, poster } = await DEPLOY();
    await expect(board.connect(poster).post("", ethers.parseUnits("1", 6)))
      .to.be.revertedWithCustomError(board, "EmptyBrief");
  });

  it("N: 无授权额度 → ERC20InsufficientAllowance", async () => {
    const { board, usdg, other } = await DEPLOY();
    await usdg.mint(other.address, ethers.parseUnits("10", 6));
    await expect(board.connect(other).post("x", ethers.parseUnits("1", 6)))
      .to.be.reverted; // SafeERC20 insufficient allowance
  });

  it("P: 过期未雇 → poster 全额退款", async () => {
    const { board, usdg, poster } = await DEPLOY();
    await postTask(board, poster);
    await bump(2 * 3600 + 10);
    await board.connect(poster).refund(1);
    expect(await usdg.balanceOf(poster.address)).to.eq(ethers.parseUnits("1000", 6));
    expect(await board.escrow()).to.eq(0);
  });

  it("N: 未过期退款 → DeadlineNotPassed", async () => {
    const { board, poster } = await DEPLOY();
    await postTask(board, poster);
    await expect(board.connect(poster).refund(1))
      .to.be.revertedWithCustomError(board, "DeadlineNotPassed");
  });

  it("N: 非发布者退款 → NotPoster", async () => {
    const { board, poster, other } = await DEPLOY();
    await postTask(board, poster);
    await bump(2 * 3600 + 10);
    await expect(board.connect(other).refund(1))
      .to.be.revertedWithCustomError(board, "NotPoster");
  });

  it("N: 重复退款 → AlreadySettled", async () => {
    const { board, poster } = await DEPLOY();
    await postTask(board, poster);
    await bump(2 * 3600 + 10);
    await board.connect(poster).refund(1);
    await expect(board.connect(poster).refund(1))
      .to.be.revertedWithCustomError(board, "AlreadySettled");
  });

  it("N: 已雇后 poster 退款 → AlreadyHired", async () => {
    const { board, operator, poster, worker1 } = await DEPLOY();
    await postTask(board, poster);
    await board.connect(operator).hire(1, worker1.address);
    await bump(2 * 3600 + 10);
    await expect(board.connect(poster).refund(1))
      .to.be.revertedWithCustomError(board, "AlreadyHired");
  });

  it("N: 非操作员雇人 → NotOperator", async () => {
    const { board, poster, other, worker1 } = await DEPLOY();
    await postTask(board, poster);
    await expect(board.connect(other).hire(1, worker1.address))
      .to.be.revertedWithCustomError(board, "NotOperator");
  });

  it("N: 重复雇人 → AlreadyHired", async () => {
    const { board, operator, poster, worker1, worker2 } = await DEPLOY();
    await postTask(board, poster);
    await board.connect(operator).hire(1, worker1.address);
    await expect(board.connect(operator).hire(1, worker2.address))
      .to.be.revertedWithCustomError(board, "AlreadyHired");
  });
});

describe("WageDecisionLog", () => {
  it("P: 操作员记录决策（含置信度与推理哈希）", async () => {
    const { log, operator } = await DEPLOY();
    const h = ethers.id("why-i-hired-claude");
    await expect(log.connect(operator).record(1, 1, 9100, 1500, h, ethers.ZeroAddress))
      .to.emit(log, "DecisionRecorded").withArgs(1, 1, 1, 9100, 1500, h, ethers.ZeroAddress);
    const d = await log.decisions(1);
    expect(d.confidenceBps).to.eq(9100);
    expect(d.reasoningHash).to.eq(h);
  });

  it("N: 非操作员记录 → NotOperator", async () => {
    const { log, other } = await DEPLOY();
    await expect(log.connect(other).record(1, 1, 100, 100, ethers.id("x"), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(log, "NotOperator");
  });

  it("N: 置信度 > 10000 → BadConfidence", async () => {
    const { log, operator } = await DEPLOY();
    await expect(log.connect(operator).record(1, 1, 10001, 1500, ethers.id("x"), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(log, "BadConfidence");
  });

  it("P: setOperator 换钥匙后旧钥匙失效", async () => {
    const { log, owner, operator, other } = await DEPLOY();
    await log.connect(owner).setOperator(other.address);
    await expect(log.connect(operator).record(1, 1, 100, 100, ethers.id("x"), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(log, "NotOperator");
    await expect(log.connect(other).record(1, 1, 100, 100, ethers.id("x"), ethers.ZeroAddress))
      .to.not.be.reverted;
  });
});

describe("WageModelRegistry", () => {
  it("P: 构造即注册 5 席且在岗", async () => {
    const { registry, worker1 } = await DEPLOY();
    expect(await registry.isActive(worker1.address)).to.eq(true);
    expect(await registry.isActive(ethers.ZeroAddress)).to.eq(false);
  });

  it("N: 非所有者改席位 → OwnableUnauthorizedAccount", async () => {
    const { registry, other } = await DEPLOY();
    await expect(registry.connect(other).setSeat(0, ethers.id("X"), other.address, true))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
  });

  it("P: 换席位后旧地址失效新地址在岗（deskOf 重映射）", async () => {
    const { registry, worker1, other } = await DEPLOY();
    await registry.setSeat(0, ethers.id("CLAUDE-v2"), other.address, true);
    expect(await registry.isActive(worker1.address)).to.eq(false);
    expect(await registry.isActive(other.address)).to.eq(true);
  });

  it("N: desk 越界 → BadDesk", async () => {
    const { registry, other } = await DEPLOY();
    await expect(registry.setSeat(5, ethers.id("X"), other.address, true))
      .to.be.revertedWithCustomError(registry, "BadDesk");
  });
});

describe("WageDecisionExecutor", () => {
  const hired = async () => {
    const d = await DEPLOY();
    await postTask(d.board, d.poster);
    await d.board.connect(d.operator).hire(1, d.worker1.address);
    return d;
  };

  it("P: 验收放款 → worker 得 bounty−fee，treasury 得 fee（feeBps=300）", async () => {
    const d = await hired();
    await d.executor.setFee(300, d.treasury.address);
    const before = await d.usdg.balanceOf(d.worker1.address);
    await d.executor.connect(d.operator).settle(1, true, 9100);
    const paid = ethers.parseUnits("1", 6) * 9700n / 10000n;
    const fee = ethers.parseUnits("1", 6) - paid;
    expect(await d.usdg.balanceOf(d.worker1.address)).to.eq(before + paid);
    expect(await d.usdg.balanceOf(d.treasury.address)).to.eq(fee);
    expect(await d.board.escrow()).to.eq(0);
  });

  it("P: 拒评 → poster 全额退款", async () => {
    const d = await hired();
    const before = await d.usdg.balanceOf(d.poster.address);
    await d.executor.connect(d.operator).settle(1, false, 6300);
    expect(await d.usdg.balanceOf(d.poster.address)).to.eq(before + ethers.parseUnits("1", 6));
  });

  it("N: 接受但低于阈值（63%<70%）→ BadVerdict（置信度即守门人）", async () => {
    const d = await hired();
    await d.executor.setThreshold(7000);
    await expect(d.executor.connect(d.operator).settle(1, true, 6300))
      .to.be.revertedWithCustomError(d.executor, "BadVerdict");
  });

  it("P: 置信度恰等于阈值 → 可接受（边界 ≥）", async () => {
    const d = await hired();
    await d.executor.setThreshold(7000);
    await expect(d.executor.connect(d.operator).settle(1, true, 7000)).to.not.be.reverted;
  });

  it("P: 阈值下拒评也退款（安全默认：Unsure means no）", async () => {
    const d = await hired();
    await d.executor.setThreshold(7000);
    await d.executor.connect(d.operator).settle(1, false, 6300);
    expect(await d.board.escrow()).to.eq(0);
  });

  it("N: 重复结算 → AlreadySettled", async () => {
    const d = await hired();
    await d.executor.connect(d.operator).settle(1, true, 9100);
    await expect(d.executor.connect(d.operator).settle(1, true, 9100))
      .to.be.revertedWithCustomError(d.executor, "AlreadySettled");
  });

  it("N: 非操作员结算 → NotOperator", async () => {
    const d = await hired();
    await expect(d.executor.connect(d.poster).settle(1, true, 9100))
      .to.be.revertedWithCustomError(d.executor, "NotOperator");
  });

  it("N: 未雇任务结算 → NotHired", async () => {
    const { executor, operator } = await DEPLOY();
    await expect(executor.connect(operator).settle(99, true, 9100))
      .to.be.revertedWithCustomError(executor, "NotHired");
  });

  it("N: 席位停用后结算 → InactiveWorker", async () => {
    const d = await hired();
    await d.registry.setSeat(0, ethers.id("CLAUDE"), d.worker1.address, false);
    await expect(d.executor.connect(d.operator).settle(1, true, 9100))
      .to.be.revertedWithCustomError(d.executor, "InactiveWorker");
  });

  it("N: 费率超上限 → BadFee", async () => {
    const { executor, owner, treasury } = await DEPLOY();
    await expect(executor.connect(owner).setFee(2001, treasury.address))
      .to.be.revertedWithCustomError(executor, "BadFee");
  });

  it("N: 非所有者设费率 → OwnableUnauthorizedAccount", async () => {
    const { executor, other, treasury } = await DEPLOY();
    await expect(executor.connect(other).setFee(300, treasury.address))
      .to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
  });
});

describe("WageDeskMandate", () => {
  it("P: fund 均分五台（100/台）", async () => {
    const { mandate } = await DEPLOY();
    const d0 = await mandate.desks(0);
    expect(d0.usdg).to.eq(ethers.parseUnits("100", 6));
    const d4 = await mandate.desks(4);
    expect(d4.usdg).to.eq(ethers.parseUnits("100", 6));
  });

  it("P: 买入在边界内 → 持仓入账 + Order 事件带推理哈希", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    const h = ethers.id("nvda-dip-buy");
    const amountIn = ethers.parseUnits("50", 6);
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, amountIn, 0, h))
      .to.emit(mandate, "Order");
    const held = await mandate.holdings(0, await stock.getAddress());
    // mock 池 99%：50 USDG → ~0.495 token（mark=100 USDG/token）
    expect(held).to.be.closeTo(ethers.parseEther("0.495"), ethers.parseEther("0.005"));
    const d0 = await mandate.desks(0);
    expect(d0.usdg).to.eq(ethers.parseUnits("50", 6));
    expect(d0.orders).to.eq(1);
  });

  it("N: 非操作员交易 → NotOperator", async () => {
    const { mandate, stock, other } = await DEPLOY();
    await expect(mandate.connect(other).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "NotOperator");
  });

  it("N: 暂停后交易 → IsPaused", async () => {
    const { mandate, stock, owner, operator } = await DEPLOY();
    await mandate.connect(owner).setPaused(true);
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "IsPaused");
  });

  it("N: 未上架代币 → NotListed", async () => {
    const { mandate, operator, other } = await DEPLOY();
    await expect(mandate.connect(operator).trade(0, other.address, true, ethers.parseUnits("10", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "NotListed");
  });

  it("N: 一小时内第二单 → TooSoon", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("a"));
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("b")))
      .to.be.revertedWithCustomError(mandate, "TooSoon");
  });

  it("P: 一小时后可再下单（time travel）", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("a"));
    await bump(3600 + 1);
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("b")))
      .to.not.be.reverted;
  });

  it("N: 买入超 50% 台面 → OverCap", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("51", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "OverCap");
  });

  it("N: 卖出超持仓 → Short", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), false, ethers.parseEther("1"), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "Short");
  });

  it("N: 池滑点超溢价带（outBps 压低）→ OffPrice，且状态不变", async () => {
    const { mandate, stock, stockPool, operator } = await DEPLOY();
    await stockPool.setOutBps(9_000); // 10% 滑点 > 2% 溢价带
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("50", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "OffPrice");
    const d0 = await mandate.desks(0);
    expect(d0.usdg).to.eq(ethers.parseUnits("100", 6)); // 台面未被污染
    const held = await mandate.holdings(0, await stock.getAddress());
    expect(held).to.eq(0);
  });

  it("N: feed 过期（4 天）→ StaleFeed", async () => {
    const { mandate, stock, feed, operator } = await DEPLOY();
    await feed.setUpdatedAt(BigInt(Math.floor(Date.now() / 1000)) - 4n * 24n * 3600n);
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "StaleFeed");
  });

  it("N: feed 归零 → BadFeed", async () => {
    const { mandate, stock, feed, operator } = await DEPLOY();
    await feed.setAnswer(0);
    await expect(mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("10", 6), 0, ethers.id("x")))
      .to.be.revertedWithCustomError(mandate, "BadFeed");
  });

  it("N: setVenue 池对不匹配 → PoolMismatch", async () => {
    const { mandate, usdg, feed, owner } = await DEPLOY();
    const MockPool = await ethers.getContractFactory("MockPool");
    const badPool = await MockPool.deploy(await usdg.getAddress(), await usdg.getAddress());
    const fakeToken = "0x" + "11".repeat(20);
    await expect(mandate.connect(owner).setVenue(fakeToken, await badPool.getAddress(), await feed.getAddress(), true))
      .to.be.revertedWithCustomError(mandate, "PoolMismatch");
  });

  it("P: 卖出在边界内 → USDG 回台面", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("50", 6), 0, ethers.id("buy"));
    await bump(3600 + 1);
    const before = (await mandate.desks(0)).usdg;
    await mandate.connect(operator).trade(0, await stock.getAddress(), false, ethers.parseEther("0.4"), 0, ethers.id("sell"));
    const after = (await mandate.desks(0)).usdg;
    expect(after).to.be.gt(before);
  });

  it("P: recall 清空台面归所有者", async () => {
    const { mandate, usdg, stock, owner, operator } = await DEPLOY();
    await mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("50", 6), 0, ethers.id("buy"));
    const before = await usdg.balanceOf(owner.address);
    await mandate.connect(owner).recall(0);
    const d0 = await mandate.desks(0);
    expect(d0.usdg).to.eq(0);
    expect((await mandate.holdings(0, await stock.getAddress()))).to.eq(0);
    expect(await usdg.balanceOf(owner.address)).to.be.gte(before);
  });

  it("P: equity = USDG 台面 + 持仓按 feed 估值", async () => {
    const { mandate, stock, operator } = await DEPLOY();
    await mandate.connect(operator).trade(0, await stock.getAddress(), true, ethers.parseUnits("50", 6), 0, ethers.id("buy"));
    const eq = await mandate.equity(0);
    // mark=100（feed 100.00）→ 0.495 token ≈ 49.5 USDG；台面 50 → equity ≈ 99.5（±1%）
    expect(eq).to.be.closeTo(ethers.parseUnits("99.5", 6), ethers.parseUnits("0.6", 6));
  });
});


describe("WageModelRegistry · 空座位（少模型起步）", () => {
  const deployRegistry = async (payouts) => {
    const [owner, w1, w2] = await ethers.getSigners();
    const models = ["A", "B", "C", "D", "E"].map((m) => ethers.encodeBytes32String(m));
    const F = await ethers.getContractFactory("WageModelRegistry");
    const r = await F.deploy(models, payouts, owner.address);
    return { r, owner, w1, w2 };
  };

  it("P: 2 个在岗 + 3 个空位可正常部署（不再 revert）", async () => {
    const [owner, w1, w2] = await ethers.getSigners();
    const Z = ethers.ZeroAddress;
    const { r } = await deployRegistry([w1.address, w2.address, Z, Z, Z]);
    expect(await r.active(0)).to.eq(true);
    expect(await r.active(1)).to.eq(true);
    expect(await r.active(2)).to.eq(false);
    expect(await r.isActive(w1.address)).to.eq(true);
    expect(await r.isActive(Z)).to.eq(false);
  });

  it("P: 空位后续可 setSeat 填人上岗", async () => {
    const [owner, w1, w2] = await ethers.getSigners();
    const Z = ethers.ZeroAddress;
    const { r } = await deployRegistry([w1.address, w2.address, Z, Z, Z]);
    await r.setSeat(2, ethers.encodeBytes32String("C"), w2.address, true);
    expect(await r.active(2)).to.eq(true);
    expect(await r.isActive(w2.address)).to.eq(true);
  });

  it("P: setSeat(payout=0) 可清空座位（停用）", async () => {
    const [owner, w1, w2] = await ethers.getSigners();
    const Z = ethers.ZeroAddress;
    const { r } = await deployRegistry([w1.address, w2.address, Z, Z, Z]);
    await r.setSeat(0, ethers.encodeBytes32String("A"), Z, true); // 传 active=true 但无地址 → 仍为停用
    expect(await r.active(0)).to.eq(false);
    expect(await r.isActive(w1.address)).to.eq(false);
  });

  it("N: 已停用的座位地址不可再被当作 active worker 结算", async () => {
    const [owner, w1, w2] = await ethers.getSigners();
    const Z = ethers.ZeroAddress;
    const { r } = await deployRegistry([w1.address, w2.address, Z, Z, Z]);
    await r.setSeat(1, ethers.encodeBytes32String("B"), Z, false);
    expect(await r.isActive(w2.address)).to.eq(false);
  });
});
