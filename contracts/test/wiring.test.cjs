const { expect } = require("chai");
const { ethers } = require("hardhat");

const Z = "0x" + "0".repeat(40);
const b32 = (s) => ethers.encodeBytes32String(s);

describe("Wage 引擎接线 · 全流程", () => {
  let usdg, reg, board, dlog, exec;
  let owner, operator, poster, worker;

  before(async () => {
    [owner, operator, poster, worker] = await ethers.getSigners();

    const MockUSDG = await ethers.getContractFactory("MockUSDG");
    usdg = await MockUSDG.deploy();

    const Registry = await ethers.getContractFactory("WageModelRegistry");
    reg = await Registry.deploy(
      ["A", "B", "C", "D", "E"].map(b32),
      [worker.address, worker.address, Z, Z, Z],
      owner.address
    );

    const TaskBoard = await ethers.getContractFactory("WageTaskBoard");
    board = await TaskBoard.deploy(await usdg.getAddress(), owner.address, operator.address);

    const DecisionLog = await ethers.getContractFactory("WageDecisionLog");
    dlog = await DecisionLog.deploy(owner.address, operator.address);

    const Executor = await ethers.getContractFactory("WageDecisionExecutor");
    exec = await Executor.deploy(
      await usdg.getAddress(), await board.getAddress(), await reg.getAddress(),
      owner.address, operator.address, owner.address
    );

    await board.setExecutor(await exec.getAddress());
    await exec.setFee(0, owner.address);
    await usdg.mint(poster.address, 10_000_000n);
    await usdg.connect(poster).approve(await board.getAddress(), 10_000_000n);
  });

  it("发任务 → 1 USDG 托管", async () => {
    await board.connect(poster).post("Test brief", 1_000_000n);
    expect(await board.escrow()).to.eq(1_000_000n);
  });

  it("雇 worker", async () => {
    await board.connect(operator).hire(1n, worker.address);
    const task = await board.tasks(1n);
    expect(task.hired).to.eq(worker.address);
  });

  it("决策记录上链", async () => {
    await dlog.connect(operator).record(1n, 2, 9100, 1500, ethers.id("test"), worker.address);
    const d = await dlog.decisions(1);
    expect(d.confidenceBps).to.eq(9100);
  });

  it("验收放款 → worker 收到 1 USDG", async () => {
    const before = await usdg.balanceOf(worker.address);
    await exec.connect(operator).settle(1n, true, 9100);
    const after = await usdg.balanceOf(worker.address);
    expect(after).to.eq(before + 1_000_000n);
  });

  it("escrow 归零", async () => {
    expect(await board.escrow()).to.eq(0);
  });
});
