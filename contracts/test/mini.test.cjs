const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("mini", () => {
  it("deploys MockUSDG", async () => {
    const F = await ethers.getContractFactory("MockUSDG");
    console.log("factory iface ctor inputs:", F.interface.fragments.filter(f => f.type === "constructor").map(f => f.inputs.length));
    const c = await F.deploy();
    await c.waitForDeployment();
    console.log("deployed at", await c.getAddress());
    expect(true).to.eq(true);
  });
});
