// AtelierDrop — ERC-721 collection: sequential IDs from 1, hard cap, batch
// limit, freezable URI, capped ERC-2981 royalties, Ownable2Step, Pausable.
// Written against the pinned API in BLUEPRINT.md. If a test fails, the
// contract drifted from the charter — fix the contract, not the test.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const NAME = "Atelier Drop";
const SYMBOL = "DROP";
const BASE_URI = "ipfs://atelier-base/";
const MAX_SUPPLY = 120n;
const ROYALTY_BPS = 500n; // 5%

// ERC-165 interface IDs
const IID_ERC165 = "0x01ffc9a7";
const IID_ERC721 = "0x80ac58cd";
const IID_ERC721_METADATA = "0x5b5e139f";
const IID_ERC2981 = "0x2a55205a";
const IID_INVALID = "0xffffffff";

describe("AtelierDrop", function () {
  let Drop;
  let drop;
  let deployer, stranger, alice, bob, royaltyReceiver, newOwner;

  async function deployDrop(overrides = {}) {
    const args = {
      name: NAME,
      symbol: SYMBOL,
      baseURI: BASE_URI,
      maxSupply: MAX_SUPPLY,
      royaltyBps: ROYALTY_BPS,
      royaltyReceiver: royaltyReceiver.address,
      owner: deployer.address,
      ...overrides,
    };
    const contract = await Drop.deploy(
      args.name,
      args.symbol,
      args.baseURI,
      args.maxSupply,
      args.royaltyBps,
      args.royaltyReceiver,
      args.owner
    );
    await contract.waitForDeployment();
    return contract;
  }

  before(async function () {
    [deployer, stranger, alice, bob, royaltyReceiver, newOwner] =
      await ethers.getSigners();
    Drop = await ethers.getContractFactory("AtelierDrop");
  });

  beforeEach(async function () {
    drop = await deployDrop();
  });

  describe("deployment", function () {
    it("stores name and symbol", async function () {
      expect(await drop.name()).to.equal(NAME);
      expect(await drop.symbol()).to.equal(SYMBOL);
    });

    it("stores the immutable max supply", async function () {
      expect(await drop.maxSupply()).to.equal(MAX_SUPPLY);
    });

    it("pins MAX_BATCH at 50", async function () {
      expect(await drop.MAX_BATCH()).to.equal(50n);
    });

    it("pins MAX_ROYALTY_BPS at 1000", async function () {
      expect(await drop.MAX_ROYALTY_BPS()).to.equal(1000n);
    });

    it("sets owner_ as the Ownable owner", async function () {
      expect(await drop.owner()).to.equal(deployer.address);
    });

    it("starts with nothing minted", async function () {
      expect(await drop.totalMinted()).to.equal(0n);
    });

    it("reverts with ZeroMaxSupply when maxSupply_ is 0", async function () {
      await expect(deployDrop({ maxSupply: 0n })).to.be.revertedWithCustomError(
        Drop,
        "ZeroMaxSupply"
      );
    });

    it("reverts with RoyaltyTooHigh when constructor royalty exceeds the cap", async function () {
      await expect(
        deployDrop({ royaltyBps: 1001n })
      ).to.be.revertedWithCustomError(Drop, "RoyaltyTooHigh");
    });

    it("accepts a constructor royalty exactly at the cap", async function () {
      const capped = await deployDrop({ royaltyBps: 1000n });
      const [, amount] = await capped.royaltyInfo(1n, 10000n);
      expect(amount).to.equal(1000n);
    });
  });

  describe("owner-only enforcement", function () {
    it("mintBatch reverts for non-owner", async function () {
      await expect(drop.connect(stranger).mintBatch(stranger.address, 1n))
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("setBaseURI reverts for non-owner", async function () {
      await expect(drop.connect(stranger).setBaseURI("ipfs://hijack/"))
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("freezeURI reverts for non-owner", async function () {
      await expect(drop.connect(stranger).freezeURI())
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("setDefaultRoyalty reverts for non-owner", async function () {
      await expect(
        drop.connect(stranger).setDefaultRoyalty(stranger.address, 100n)
      )
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("pause reverts for non-owner", async function () {
      await expect(drop.connect(stranger).pause())
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("unpause reverts for non-owner", async function () {
      await drop.pause();
      await expect(drop.connect(stranger).unpause())
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("transferOwnership reverts for non-owner", async function () {
      await expect(drop.connect(stranger).transferOwnership(stranger.address))
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });

  describe("sequential minting", function () {
    it("token IDs start at 1 and run sequentially", async function () {
      const tx = drop.mintBatch(alice.address, 3n);
      await expect(tx)
        .to.emit(drop, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, 1n);
      await expect(tx)
        .to.emit(drop, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, 2n);
      await expect(tx)
        .to.emit(drop, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, 3n);

      expect(await drop.ownerOf(1n)).to.equal(alice.address);
      expect(await drop.ownerOf(2n)).to.equal(alice.address);
      expect(await drop.ownerOf(3n)).to.equal(alice.address);
      expect(await drop.balanceOf(alice.address)).to.equal(3n);
    });

    it("a second batch continues the sequence, no gaps", async function () {
      await drop.mintBatch(alice.address, 2n);
      await drop.mintBatch(bob.address, 2n);
      expect(await drop.ownerOf(3n)).to.equal(bob.address);
      expect(await drop.ownerOf(4n)).to.equal(bob.address);
    });

    it("totalMinted tracks every batch", async function () {
      await drop.mintBatch(alice.address, 5n);
      expect(await drop.totalMinted()).to.equal(5n);
      await drop.mintBatch(bob.address, 7n);
      expect(await drop.totalMinted()).to.equal(12n);
    });
  });

  describe("batch limit", function () {
    it("allows a batch of exactly MAX_BATCH (boundary)", async function () {
      await drop.mintBatch(alice.address, 50n);
      expect(await drop.totalMinted()).to.equal(50n);
    });

    it("reverts with BatchTooLarge at MAX_BATCH + 1", async function () {
      await expect(
        drop.mintBatch(alice.address, 51n)
      ).to.be.revertedWithCustomError(drop, "BatchTooLarge");
    });
  });

  describe("supply cap", function () {
    let small;

    beforeEach(async function () {
      small = await deployDrop({ maxSupply: 5n });
    });

    it("mints exactly up to maxSupply (boundary)", async function () {
      await small.mintBatch(alice.address, 3n);
      await small.mintBatch(alice.address, 2n);
      expect(await small.totalMinted()).to.equal(5n);
    });

    it("reverts with MaxSupplyExceeded one token over the cap", async function () {
      await small.mintBatch(alice.address, 5n);
      await expect(
        small.mintBatch(alice.address, 1n)
      ).to.be.revertedWithCustomError(small, "MaxSupplyExceeded");
    });

    it("reverts when a single batch alone would overshoot the cap", async function () {
      await expect(
        small.mintBatch(alice.address, 6n)
      ).to.be.revertedWithCustomError(small, "MaxSupplyExceeded");
    });

    it("reverts when a later batch would overshoot the remaining headroom", async function () {
      await small.mintBatch(alice.address, 4n);
      await expect(
        small.mintBatch(alice.address, 2n)
      ).to.be.revertedWithCustomError(small, "MaxSupplyExceeded");
    });
  });

  describe("pausing", function () {
    beforeEach(async function () {
      await drop.mintBatch(alice.address, 2n);
    });

    it("blocks mintBatch while paused", async function () {
      await drop.pause();
      await expect(
        drop.mintBatch(bob.address, 1n)
      ).to.be.revertedWithCustomError(drop, "EnforcedPause");
    });

    it("blocks transfers while paused", async function () {
      await drop.pause();
      await expect(
        drop
          .connect(alice)
          .transferFrom(alice.address, bob.address, 1n)
      ).to.be.revertedWithCustomError(drop, "EnforcedPause");
    });

    it("unpause restores mint and transfer", async function () {
      await drop.pause();
      await drop.unpause();
      await drop.mintBatch(bob.address, 1n);
      await drop.connect(alice).transferFrom(alice.address, bob.address, 1n);
      expect(await drop.ownerOf(1n)).to.equal(bob.address);
    });
  });

  describe("token URIs and the freeze", function () {
    beforeEach(async function () {
      await drop.mintBatch(alice.address, 2n);
    });

    it("tokenURI is {baseURI}{id}.json", async function () {
      expect(await drop.tokenURI(1n)).to.equal(`${BASE_URI}1.json`);
      expect(await drop.tokenURI(2n)).to.equal(`${BASE_URI}2.json`);
    });

    it("setBaseURI repoints every token", async function () {
      await drop.setBaseURI("ipfs://reveal/");
      expect(await drop.tokenURI(1n)).to.equal("ipfs://reveal/1.json");
    });

    it("freezeURI emits URIFrozen", async function () {
      await expect(drop.freezeURI()).to.emit(drop, "URIFrozen");
    });

    it("setBaseURI after freeze reverts with URIIsFrozen — even for the owner", async function () {
      await drop.freezeURI();
      await expect(
        drop.setBaseURI("ipfs://too-late/")
      ).to.be.revertedWithCustomError(drop, "URIIsFrozen");
      expect(await drop.tokenURI(1n)).to.equal(`${BASE_URI}1.json`);
    });
  });

  describe("ERC-2981 royalties", function () {
    it("royaltyInfo pays the constructor receiver at the constructor bps", async function () {
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await drop.royaltyInfo(1n, salePrice);
      expect(receiver).to.equal(royaltyReceiver.address);
      expect(amount).to.equal((salePrice * ROYALTY_BPS) / 10000n);
    });

    it("setDefaultRoyalty updates receiver and bps", async function () {
      await drop.setDefaultRoyalty(bob.address, 250n);
      const [receiver, amount] = await drop.royaltyInfo(1n, 10000n);
      expect(receiver).to.equal(bob.address);
      expect(amount).to.equal(250n);
    });

    it("setDefaultRoyalty accepts exactly MAX_ROYALTY_BPS (boundary)", async function () {
      await drop.setDefaultRoyalty(bob.address, 1000n);
      const [, amount] = await drop.royaltyInfo(1n, 10000n);
      expect(amount).to.equal(1000n);
    });

    it("setDefaultRoyalty reverts with RoyaltyTooHigh at MAX_ROYALTY_BPS + 1", async function () {
      await expect(
        drop.setDefaultRoyalty(bob.address, 1001n)
      ).to.be.revertedWithCustomError(drop, "RoyaltyTooHigh");
    });
  });

  describe("ERC-165", function () {
    it("supports ERC721, ERC721Metadata, ERC2981, and ERC165", async function () {
      expect(await drop.supportsInterface(IID_ERC721)).to.equal(true);
      expect(await drop.supportsInterface(IID_ERC721_METADATA)).to.equal(true);
      expect(await drop.supportsInterface(IID_ERC2981)).to.equal(true);
      expect(await drop.supportsInterface(IID_ERC165)).to.equal(true);
    });

    it("rejects the invalid interface ID", async function () {
      expect(await drop.supportsInterface(IID_INVALID)).to.equal(false);
    });
  });

  describe("Ownable2Step handoff", function () {
    it("transferOwnership records the pending owner without changing owner", async function () {
      await drop.transferOwnership(newOwner.address);
      expect(await drop.pendingOwner()).to.equal(newOwner.address);
      expect(await drop.owner()).to.equal(deployer.address);
    });

    it("old owner retains privileged control until the pending owner accepts", async function () {
      await drop.transferOwnership(newOwner.address);
      await drop.mintBatch(alice.address, 1n); // still works
      await expect(drop.connect(newOwner).mintBatch(alice.address, 1n))
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(newOwner.address);
    });

    it("only the pending owner can accept", async function () {
      await drop.transferOwnership(newOwner.address);
      await expect(drop.connect(stranger).acceptOwnership())
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("acceptOwnership completes the handoff and revokes the old owner", async function () {
      await drop.transferOwnership(newOwner.address);
      await expect(drop.connect(newOwner).acceptOwnership())
        .to.emit(drop, "OwnershipTransferred")
        .withArgs(deployer.address, newOwner.address);

      expect(await drop.owner()).to.equal(newOwner.address);
      expect(await drop.pendingOwner()).to.equal(ethers.ZeroAddress);

      await drop.connect(newOwner).mintBatch(alice.address, 1n);
      await expect(drop.connect(deployer).mintBatch(alice.address, 1n))
        .to.be.revertedWithCustomError(drop, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);
    });

    it("renounceOwnership is disabled for everyone, owner included", async function () {
      await expect(
        drop.renounceOwnership()
      ).to.be.revertedWithCustomError(drop, "RenounceDisabled");
      await expect(
        drop.connect(stranger).renounceOwnership()
      ).to.be.revertedWithCustomError(drop, "RenounceDisabled");
      expect(await drop.owner()).to.equal(deployer.address);
    });

    it("renounceOwnership stays disabled while paused (no orphaned pause)", async function () {
      await drop.pause();
      await expect(
        drop.renounceOwnership()
      ).to.be.revertedWithCustomError(drop, "RenounceDisabled");
      await drop.unpause();
    });
  });
});
