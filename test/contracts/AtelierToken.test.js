// AtelierToken — ERC-20 with a hard cap, Ownable2Step, Pausable, Permit.
// Written against the pinned API in BLUEPRINT.md. If a test fails, the
// contract drifted from the charter — fix the contract, not the test.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const NAME = "Atelier Token";
const SYMBOL = "ATL";
const DECIMALS = 18;
const MAX_SUPPLY = ethers.parseUnits("1000000", DECIMALS);

describe("AtelierToken", function () {
  let Token;
  let token;
  let deployer, stranger, alice, bob, newOwner;

  async function deployToken(overrides = {}) {
    const args = {
      name: NAME,
      symbol: SYMBOL,
      decimals: DECIMALS,
      maxSupply: MAX_SUPPLY,
      owner: deployer.address,
      ...overrides,
    };
    const contract = await Token.deploy(
      args.name,
      args.symbol,
      args.decimals,
      args.maxSupply,
      args.owner
    );
    await contract.waitForDeployment();
    return contract;
  }

  before(async function () {
    [deployer, stranger, alice, bob, newOwner] = await ethers.getSigners();
    Token = await ethers.getContractFactory("AtelierToken");
  });

  beforeEach(async function () {
    token = await deployToken();
  });

  describe("deployment", function () {
    it("stores name and symbol", async function () {
      expect(await token.name()).to.equal(NAME);
      expect(await token.symbol()).to.equal(SYMBOL);
    });

    it("returns the constructor decimals value", async function () {
      expect(await token.decimals()).to.equal(DECIMALS);
    });

    it("honors a non-18 decimals value", async function () {
      const six = await deployToken({
        decimals: 6,
        maxSupply: ethers.parseUnits("1000000", 6),
      });
      expect(await six.decimals()).to.equal(6);
    });

    it("stores the immutable max supply", async function () {
      expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
    });

    it("sets owner_ as the Ownable owner", async function () {
      expect(await token.owner()).to.equal(deployer.address);
    });

    it("sets an owner distinct from the deployer when asked", async function () {
      const other = await deployToken({ owner: alice.address });
      expect(await other.owner()).to.equal(alice.address);
      await expect(
        other.connect(deployer).mint(bob.address, 1n)
      ).to.be.revertedWithCustomError(other, "OwnableUnauthorizedAccount");
    });

    it("starts with zero total supply", async function () {
      expect(await token.totalSupply()).to.equal(0n);
    });

    it("reverts with ZeroMaxSupply when maxSupply_ is 0", async function () {
      await expect(
        Token.deploy(NAME, SYMBOL, DECIMALS, 0n, deployer.address)
      ).to.be.revertedWithCustomError(Token, "ZeroMaxSupply");
    });
  });

  describe("owner-only enforcement", function () {
    it("mint reverts for non-owner", async function () {
      await expect(token.connect(stranger).mint(stranger.address, 1n))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("pause reverts for non-owner", async function () {
      await expect(token.connect(stranger).pause())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("unpause reverts for non-owner", async function () {
      await token.pause();
      await expect(token.connect(stranger).unpause())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("transferOwnership reverts for non-owner", async function () {
      await expect(token.connect(stranger).transferOwnership(stranger.address))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });

  describe("minting and the supply cap", function () {
    it("owner mints and balances update", async function () {
      await token.mint(alice.address, 1000n);
      expect(await token.balanceOf(alice.address)).to.equal(1000n);
      expect(await token.totalSupply()).to.equal(1000n);
    });

    it("mints exactly up to maxSupply (boundary)", async function () {
      await token.mint(alice.address, MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("reverts with MaxSupplyExceeded one unit over the cap", async function () {
      await token.mint(alice.address, MAX_SUPPLY);
      await expect(
        token.mint(alice.address, 1n)
      ).to.be.revertedWithCustomError(token, "MaxSupplyExceeded");
    });

    it("reverts when a single mint alone would exceed the cap", async function () {
      await expect(
        token.mint(alice.address, MAX_SUPPLY + 1n)
      ).to.be.revertedWithCustomError(token, "MaxSupplyExceeded");
    });

    it("reaches the cap across multiple tranches, then rejects one more", async function () {
      const half = MAX_SUPPLY / 2n;
      await token.mint(alice.address, half);
      await token.mint(bob.address, MAX_SUPPLY - half);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
      await expect(
        token.mint(bob.address, 1n)
      ).to.be.revertedWithCustomError(token, "MaxSupplyExceeded");
    });
  });

  describe("pausing", function () {
    beforeEach(async function () {
      await token.mint(alice.address, 1000n);
    });

    it("emits Paused / Unpaused", async function () {
      await expect(token.pause()).to.emit(token, "Paused");
      await expect(token.unpause()).to.emit(token, "Unpaused");
    });

    it("blocks mint while paused", async function () {
      await token.pause();
      await expect(
        token.mint(bob.address, 1n)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("blocks transfer while paused", async function () {
      await token.pause();
      await expect(
        token.connect(alice).transfer(bob.address, 10n)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("blocks transferFrom while paused", async function () {
      await token.connect(alice).approve(bob.address, 100n);
      await token.pause();
      await expect(
        token.connect(bob).transferFrom(alice.address, bob.address, 10n)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("unpause restores mint and transfer", async function () {
      await token.pause();
      await token.unpause();
      await token.mint(bob.address, 5n);
      await token.connect(alice).transfer(bob.address, 10n);
      expect(await token.balanceOf(bob.address)).to.equal(15n);
    });
  });

  describe("ERC20Permit", function () {
    it("exposes nonces starting at zero", async function () {
      expect(await token.nonces(alice.address)).to.equal(0n);
    });

    it("exposes a non-zero DOMAIN_SEPARATOR", async function () {
      const separator = await token.DOMAIN_SEPARATOR();
      expect(separator).to.match(/^0x[0-9a-f]{64}$/i);
      expect(separator).to.not.equal(ethers.ZeroHash);
    });

    async function signPermit(signer, spender, value, deadline) {
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: NAME,
        version: "1",
        chainId: network.chainId,
        verifyingContract: await token.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: signer.address,
        spender,
        value,
        nonce: await token.nonces(signer.address),
        deadline,
      };
      const signature = await signer.signTypedData(domain, types, message);
      return ethers.Signature.from(signature);
    }

    it("permit sets allowance from a valid EIP-712 signature and bumps the nonce", async function () {
      const value = ethers.parseUnits("123", DECIMALS);
      const deadline = ethers.MaxUint256;
      const { v, r, s } = await signPermit(alice, bob.address, value, deadline);

      await token
        .connect(stranger)
        .permit(alice.address, bob.address, value, deadline, v, r, s);

      expect(await token.allowance(alice.address, bob.address)).to.equal(value);
      expect(await token.nonces(alice.address)).to.equal(1n);
    });

    it("permit rejects an expired deadline", async function () {
      const value = 1n;
      const deadline = 1n; // long past
      const { v, r, s } = await signPermit(alice, bob.address, value, deadline);
      await expect(
        token.permit(alice.address, bob.address, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(token, "ERC2612ExpiredSignature");
    });

    it("permit rejects a signature from the wrong signer", async function () {
      const value = 1n;
      const deadline = ethers.MaxUint256;
      const { v, r, s } = await signPermit(bob, bob.address, value, deadline);
      await expect(
        token.permit(alice.address, bob.address, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(token, "ERC2612InvalidSigner");
    });
  });

  describe("Ownable2Step handoff", function () {
    it("transferOwnership records the pending owner without changing owner", async function () {
      await token.transferOwnership(newOwner.address);
      expect(await token.pendingOwner()).to.equal(newOwner.address);
      expect(await token.owner()).to.equal(deployer.address);
    });

    it("old owner retains privileged control until the pending owner accepts", async function () {
      await token.transferOwnership(newOwner.address);
      await token.mint(alice.address, 1n); // still works
      await expect(token.connect(newOwner).mint(alice.address, 1n))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(newOwner.address);
    });

    it("only the pending owner can accept", async function () {
      await token.transferOwnership(newOwner.address);
      await expect(token.connect(stranger).acceptOwnership())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("acceptOwnership completes the handoff and revokes the old owner", async function () {
      await token.transferOwnership(newOwner.address);
      await expect(token.connect(newOwner).acceptOwnership())
        .to.emit(token, "OwnershipTransferred")
        .withArgs(deployer.address, newOwner.address);

      expect(await token.owner()).to.equal(newOwner.address);
      expect(await token.pendingOwner()).to.equal(ethers.ZeroAddress);

      await token.connect(newOwner).mint(alice.address, 1n);
      await expect(token.connect(deployer).mint(alice.address, 1n))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);
    });

    it("renounceOwnership is disabled for everyone, owner included", async function () {
      await expect(
        token.renounceOwnership()
      ).to.be.revertedWithCustomError(token, "RenounceDisabled");
      await expect(
        token.connect(stranger).renounceOwnership()
      ).to.be.revertedWithCustomError(token, "RenounceDisabled");
      expect(await token.owner()).to.equal(deployer.address);
    });

    it("renounceOwnership stays disabled while paused (no orphaned pause)", async function () {
      await token.pause();
      await expect(
        token.renounceOwnership()
      ).to.be.revertedWithCustomError(token, "RenounceDisabled");
      await token.unpause();
    });
  });
});
