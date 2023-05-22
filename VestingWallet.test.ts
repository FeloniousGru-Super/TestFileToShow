const { expect } = require("chai");
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { snapshot, restore, moveForwardPeriods } from "./utils";

describe("VESTING WALLET Test", function () {
  const FIRST_SALE = ethers.utils.parseEther("1000000"); // 1,000,000 RXB tokens

  const INITIAL_PRICE = ethers.utils.parseUnits("0.13", 6); // 0.13 USD per one RXB for initial

  const TEST_VESTING_1 = ethers.utils.parseEther("1000"); // 1,000 RXB tokens
  const TEST_VESTING_2 = ethers.utils.parseEther("2000"); // 2,000 RXB tokens

  const VESTING_DURATION = 180; // 180 days
  const VESTING_INTERVAL = 45; // 45 days

  let rexbit: Contract;
  let vestingWallet: Contract;
  let owner: SignerWithAddress;
  let vault: SignerWithAddress;
  let user: SignerWithAddress;

  before(async function () {
    [owner, vault, user] = await ethers.getSigners();
    const REXBIT = await ethers.getContractFactory("Rexbit");
    rexbit = await upgrades.deployProxy(REXBIT, [INITIAL_PRICE]);
    await rexbit.deployed();
    console.log(rexbit.address);

    await rexbit.firstSale(vault.address);

    const VESTING_WALLET = await ethers.getContractFactory("VestingWallet");
    vestingWallet = await upgrades.deployProxy(VESTING_WALLET, [
      rexbit.address,
    ]);
    await vestingWallet.deployed();
    console.log(vestingWallet.address);

    await vestingWallet.transferOwnership(vault.address);
  });

  describe("Add Vesting", function () {
    it("Address Zero fail", async function () {
      await expect(
        vestingWallet
          .connect(vault)
          .addVestingSchedule(ethers.constants.AddressZero, TEST_VESTING_1)
      ).to.be.revertedWith("Invalid investor address");
    });

    it("Amount Zero fail", async function () {
      await expect(
        vestingWallet
          .connect(vault)
          .addVestingSchedule(user.address, ethers.constants.Zero)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Add Vesting works", async function () {
      await rexbit
        .connect(vault)
        .approve(vestingWallet.address, FIRST_SALE);

      const currentTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;

      await expect(
        vestingWallet
          .connect(vault)
          .addVestingSchedule(user.address, TEST_VESTING_1)
      )
        .to.emit(vestingWallet, "VestingAdded")
        .withArgs(user.address, TEST_VESTING_1, currentTimestamp + 1);

      expect(await rexbit.balanceOf(vestingWallet.address)).to.equal(
        TEST_VESTING_1
      );

      expect(await vestingWallet.balances(vestingWallet.address)).to.equal(
        TEST_VESTING_1
      );

      await expect(
        vestingWallet
          .connect(vault)
          .addVestingSchedule(user.address, TEST_VESTING_2)
      )
        .to.emit(vestingWallet, "VestingAdded")
        .withArgs(user.address, TEST_VESTING_2, currentTimestamp + 2);

      expect(await rexbit.balanceOf(vestingWallet.address)).to.equal(
        TEST_VESTING_1.add(TEST_VESTING_2)
      );

      expect(await vestingWallet.balances(vestingWallet.address)).to.equal(
        TEST_VESTING_1.add(TEST_VESTING_2)
      );
    });
  });

  describe("Release Vesting", function () {
    let snapshotId: any;

    beforeEach(async () => {
      snapshotId = await snapshot();
    });

    it("No vested tokens", async function () {
      await expect(vestingWallet.connect(user).release()).to.be.revertedWith(
        "No tokens vested"
      );

      await moveForwardPeriods(VESTING_INTERVAL - 1);

      await expect(vestingWallet.connect(user).release()).to.be.revertedWith(
        "No tokens vested"
      );

      await restore(snapshotId);
    });

    it("Release Vesting works", async function () {
      await moveForwardPeriods(VESTING_DURATION);

      await vestingWallet.connect(user).release();

      expect(await rexbit.balanceOf(user.address)).to.equal(
        TEST_VESTING_1.add(TEST_VESTING_2)
      );
      expect(await vestingWallet.balances(vestingWallet.address)).to.equal(
        ethers.constants.Zero
      );
      expect(await vestingWallet.balances(user.address)).to.equal(
        TEST_VESTING_1.add(TEST_VESTING_2)
      );

      await restore(snapshotId);

      await moveForwardPeriods(VESTING_INTERVAL);

      const TEST_VESTED_1_STEP_1 = TEST_VESTING_1.div(
        VESTING_DURATION / VESTING_INTERVAL
      );
      const TEST_VESTED_2_STEP_1 = TEST_VESTING_2.div(
        VESTING_DURATION / VESTING_INTERVAL
      );

      await vestingWallet.connect(user).release();

      expect(await rexbit.balanceOf(user.address)).to.equal(
        TEST_VESTED_1_STEP_1.add(TEST_VESTED_2_STEP_1)
      );
      expect(await vestingWallet.balances(vestingWallet.address)).to.equal(
        TEST_VESTING_1.sub(TEST_VESTED_1_STEP_1).add(
          TEST_VESTING_2.sub(TEST_VESTED_2_STEP_1)
        )
      );
      expect(await vestingWallet.balances(user.address)).to.equal(
        TEST_VESTED_1_STEP_1.add(TEST_VESTED_2_STEP_1)
      );

      await moveForwardPeriods(VESTING_INTERVAL - 1);

      await expect(vestingWallet.connect(user).release()).to.be.revertedWith(
        "No tokens vested"
      );

      await moveForwardPeriods(VESTING_INTERVAL);

      const TEST_VESTED_1_STEP_2 = TEST_VESTING_1.div(
        VESTING_DURATION / VESTING_INTERVAL
      );
      const TEST_VESTED_2_STEP_2 = TEST_VESTING_2.div(
        VESTING_DURATION / VESTING_INTERVAL
      );

      await vestingWallet.connect(user).release();

      expect(await rexbit.balanceOf(user.address)).to.equal(
        TEST_VESTED_1_STEP_1.add(TEST_VESTED_2_STEP_1)
          .add(TEST_VESTED_1_STEP_2)
          .add(TEST_VESTED_2_STEP_2)
      );
      expect(await vestingWallet.balances(vestingWallet.address)).to.equal(
        TEST_VESTING_1.sub(TEST_VESTED_1_STEP_1)
          .sub(TEST_VESTED_1_STEP_2)
          .add(
            TEST_VESTING_2.sub(TEST_VESTED_2_STEP_1).sub(TEST_VESTED_2_STEP_2)
          )
      );
      expect(await vestingWallet.balances(user.address)).to.equal(
        TEST_VESTED_1_STEP_1.add(TEST_VESTED_2_STEP_1)
          .add(TEST_VESTED_1_STEP_2)
          .add(TEST_VESTED_2_STEP_2)
      );
    });
  });
});
