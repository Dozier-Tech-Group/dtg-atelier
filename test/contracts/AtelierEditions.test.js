// AtelierEditions — ERC-1155 editions: explicit createEdition, per-id caps
// via ERC1155Supply, freezable URI, capped ERC-2981 royalties, Ownable2Step,
// Pausable. Written against the pinned API in BLUEPRINT.md. If a test fails,
// the contract drifted from the charter — fix the contract, not the test.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const URI = "ipfs://atelier-editions/{id}.json";
const ROYALTY_BPS = 500n; // 5%

// ERC-165 interface IDs
const IID_ERC165 = "0x01ffc9a7";
const IID_ERC1155 = "0xd9b67a26";
const IID_ERC1155_METADATA_URI = "0x0e89341c";
const IID_ERC2981 = "0x2a55205a";
const IID_INVALID = "0xffffffff";

describe("AtelierEditions", function () {
  let Editions;
  let editions;
  let deployer, stranger, alice, bob, royaltyReceiver, newOwner;

  async function deployEditions(overrides = {}) {
    const args = {
      uri: URI,
      royaltyBps: ROYALTY_BPS,
      royaltyReceiver: royaltyReceiver.address,
      owner: deployer.address,
      ...overrides,
    };
    const contract = await Editions.deploy(
      args.uri,
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
    Editions = await ethers.getContractFactory("AtelierEditions");
  });

  beforeEach(async function () {
    editions = await deployEditions();
  });

  describe("deployment", function () {
    it("stores the constructor URI", async function () {
      expect(await editions.uri(1n)).to.equal(URI);
    });

    it("pins MAX_ROYALTY_BPS at 1000", async function () {
      expect(await editions.MAX_ROYALTY_BPS()).to.equal(1000n);
    });

    it("sets owner_ as the Ownable owner", async function () {
      expect(await editions.owner()).to.equal(deployer.address);
    });

    it("reverts with RoyaltyTooHigh when constructor royalty exceeds the cap", async function () {
      await expect(
        deployEditions({ royaltyBps: 1001n })
      ).to.be.revertedWithCustomError(Editions, "RoyaltyTooHigh");
    });

    it("accepts a constructor royalty exactly at the cap", async function () {
      const capped = await deployEditions({ royaltyBps: 1000n });
      const [, amount] = await capped.royaltyInfo(1n, 10000n);
      expect(amount).to.equal(1000n);
    });
  });

  describe("owner-only enforcement", function () {
    it("createEdition reverts for non-owner", async function () {
      await expect(editions.connect(stranger).createEdition(1n, 10n))
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("mint reverts for non-owner", async function () {
      await editions.createEdition(1n, 10n);
      await expect(editions.connect(stranger).mint(stranger.address, 1n, 1n))
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("setURI reverts for non-owner", async function () {
      await expect(editions.connect(stranger).setURI("ipfs://hijack/"))
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("freezeURI reverts for non-owner", async function () {
      await expect(editions.connect(stranger).freezeURI())
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("setDefaultRoyalty reverts for non-owner", async function () {
      await expect(
        editions.connect(stranger).setDefaultRoyalty(stranger.address, 100n)
      )
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("pause reverts for non-owner", async function () {
      await expect(editions.connect(stranger).pause())
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("unpause reverts for non-owner", async function () {
      await editions.pause();
      await expect(editions.connect(stranger).unpause())
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("transferOwnership reverts for non-owner", async function () {
      await expect(
        editions.connect(stranger).transferOwnership(stranger.address)
      )
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });

  describe("createEdition", function () {
    it("records the per-id max supply", async function () {
      await editions.createEdition(1n, 100n);
      expect(await editions.editionMaxSupply(1n)).to.equal(100n);
    });

    it("editionMaxSupply is 0 for an uncreated edition", async function () {
      expect(await editions.editionMaxSupply(42n)).to.equal(0n);
    });

    it("reverts with ZeroMaxSupply when maxSupply is 0", async function () {
      await expect(
        editions.createEdition(1n, 0n)
      ).to.be.revertedWithCustomError(editions, "ZeroMaxSupply");
    });

    it("reverts with EditionExists on a duplicate id", async function () {
      await editions.createEdition(1n, 100n);
      await expect(
        editions.createEdition(1n, 200n)
      ).to.be.revertedWithCustomError(editions, "EditionExists");
    });

    it("duplicate check holds even with a different maxSupply", async function () {
      await editions.createEdition(7n, 5n);
      await expect(
        editions.createEdition(7n, 5n)
      ).to.be.revertedWithCustomError(editions, "EditionExists");
      expect(await editions.editionMaxSupply(7n)).to.equal(5n);
    });

    it("distinct ids are independent editions", async function () {
      await editions.createEdition(1n, 10n);
      await editions.createEdition(2n, 20n);
      expect(await editions.editionMaxSupply(1n)).to.equal(10n);
      expect(await editions.editionMaxSupply(2n)).to.equal(20n);
    });
  });

  describe("minting and per-id caps", function () {
    beforeEach(async function () {
      await editions.createEdition(1n, 10n);
    });

    it("owner mints into a created edition", async function () {
      await expect(editions.mint(alice.address, 1n, 4n))
        .to.emit(editions, "TransferSingle")
        .withArgs(deployer.address, ethers.ZeroAddress, alice.address, 1n, 4n);
      expect(await editions.balanceOf(alice.address, 1n)).to.equal(4n);
    });

    it("reverts with EditionUnknown for an id never created", async function () {
      await expect(
        editions.mint(alice.address, 99n, 1n)
      ).to.be.revertedWithCustomError(editions, "EditionUnknown");
    });

    it("mints exactly up to the per-id cap (boundary)", async function () {
      await editions.mint(alice.address, 1n, 6n);
      await editions.mint(bob.address, 1n, 4n);
      expect(await editions.balanceOf(alice.address, 1n)).to.equal(6n);
      expect(await editions.balanceOf(bob.address, 1n)).to.equal(4n);
    });

    it("reverts with MaxSupplyExceeded one unit over the cap", async function () {
      await editions.mint(alice.address, 1n, 10n);
      await expect(
        editions.mint(alice.address, 1n, 1n)
      ).to.be.revertedWithCustomError(editions, "MaxSupplyExceeded");
    });

    it("reverts when a single mint alone would overshoot the cap", async function () {
      await expect(
        editions.mint(alice.address, 1n, 11n)
      ).to.be.revertedWithCustomError(editions, "MaxSupplyExceeded");
    });

    it("reverts when a later mint would overshoot the remaining headroom", async function () {
      await editions.mint(alice.address, 1n, 8n);
      await expect(
        editions.mint(alice.address, 1n, 3n)
      ).to.be.revertedWithCustomError(editions, "MaxSupplyExceeded");
    });

    it("one edition hitting its cap does not block another", async function () {
      await editions.createEdition(2n, 3n);
      await editions.mint(alice.address, 1n, 10n); // edition 1 full
      await editions.mint(alice.address, 2n, 3n); // edition 2 still mints
      expect(await editions.balanceOf(alice.address, 2n)).to.equal(3n);
    });
  });

  describe("pausing", function () {
    beforeEach(async function () {
      await editions.createEdition(1n, 10n);
      await editions.mint(alice.address, 1n, 5n);
    });

    it("blocks mint while paused", async function () {
      await editions.pause();
      await expect(
        editions.mint(bob.address, 1n, 1n)
      ).to.be.revertedWithCustomError(editions, "EnforcedPause");
    });

    it("blocks transfers while paused", async function () {
      await editions.pause();
      await expect(
        editions
          .connect(alice)
          .safeTransferFrom(alice.address, bob.address, 1n, 2n, "0x")
      ).to.be.revertedWithCustomError(editions, "EnforcedPause");
    });

    it("unpause restores mint and transfer", async function () {
      await editions.pause();
      await editions.unpause();
      await editions.mint(bob.address, 1n, 1n);
      await editions
        .connect(alice)
        .safeTransferFrom(alice.address, bob.address, 1n, 2n, "0x");
      expect(await editions.balanceOf(bob.address, 1n)).to.equal(3n);
    });
  });

  describe("URI and the freeze", function () {
    it("setURI repoints the collection URI", async function () {
      await editions.setURI("ipfs://reveal/{id}.json");
      expect(await editions.uri(1n)).to.equal("ipfs://reveal/{id}.json");
    });

    it("freezeURI emits URIFrozen", async function () {
      await expect(editions.freezeURI()).to.emit(editions, "URIFrozen");
    });

    it("setURI after freeze reverts with URIIsFrozen — even for the owner", async function () {
      await editions.freezeURI();
      await expect(
        editions.setURI("ipfs://too-late/")
      ).to.be.revertedWithCustomError(editions, "URIIsFrozen");
      expect(await editions.uri(1n)).to.equal(URI);
    });
  });

  describe("ERC-2981 royalties", function () {
    it("royaltyInfo pays the constructor receiver at the constructor bps", async function () {
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await editions.royaltyInfo(1n, salePrice);
      expect(receiver).to.equal(royaltyReceiver.address);
      expect(amount).to.equal((salePrice * ROYALTY_BPS) / 10000n);
    });

    it("setDefaultRoyalty updates receiver and bps", async function () {
      await editions.setDefaultRoyalty(bob.address, 250n);
      const [receiver, amount] = await editions.royaltyInfo(1n, 10000n);
      expect(receiver).to.equal(bob.address);
      expect(amount).to.equal(250n);
    });

    it("setDefaultRoyalty accepts exactly MAX_ROYALTY_BPS (boundary)", async function () {
      await editions.setDefaultRoyalty(bob.address, 1000n);
      const [, amount] = await editions.royaltyInfo(1n, 10000n);
      expect(amount).to.equal(1000n);
    });

    it("setDefaultRoyalty reverts with RoyaltyTooHigh at MAX_ROYALTY_BPS + 1", async function () {
      await expect(
        editions.setDefaultRoyalty(bob.address, 1001n)
      ).to.be.revertedWithCustomError(editions, "RoyaltyTooHigh");
    });
  });

  describe("ERC-165", function () {
    it("supports ERC1155, ERC1155MetadataURI, ERC2981, and ERC165", async function () {
      expect(await editions.supportsInterface(IID_ERC1155)).to.equal(true);
      expect(
        await editions.supportsInterface(IID_ERC1155_METADATA_URI)
      ).to.equal(true);
      expect(await editions.supportsInterface(IID_ERC2981)).to.equal(true);
      expect(await editions.supportsInterface(IID_ERC165)).to.equal(true);
    });

    it("rejects the invalid interface ID", async function () {
      expect(await editions.supportsInterface(IID_INVALID)).to.equal(false);
    });
  });

  describe("Ownable2Step handoff", function () {
    it("transferOwnership records the pending owner without changing owner", async function () {
      await editions.transferOwnership(newOwner.address);
      expect(await editions.pendingOwner()).to.equal(newOwner.address);
      expect(await editions.owner()).to.equal(deployer.address);
    });

    it("old owner retains privileged control until the pending owner accepts", async function () {
      await editions.transferOwnership(newOwner.address);
      await editions.createEdition(1n, 10n); // still works
      await expect(editions.connect(newOwner).createEdition(2n, 10n))
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(newOwner.address);
    });

    it("only the pending owner can accept", async function () {
      await editions.transferOwnership(newOwner.address);
      await expect(editions.connect(stranger).acceptOwnership())
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("acceptOwnership completes the handoff and revokes the old owner", async function () {
      await editions.transferOwnership(newOwner.address);
      await expect(editions.connect(newOwner).acceptOwnership())
        .to.emit(editions, "OwnershipTransferred")
        .withArgs(deployer.address, newOwner.address);

      expect(await editions.owner()).to.equal(newOwner.address);
      expect(await editions.pendingOwner()).to.equal(ethers.ZeroAddress);

      await editions.connect(newOwner).createEdition(1n, 10n);
      await expect(editions.connect(deployer).createEdition(2n, 10n))
        .to.be.revertedWithCustomError(editions, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);
    });

    it("renounceOwnership is disabled for everyone, owner included", async function () {
      await expect(
        editions.renounceOwnership()
      ).to.be.revertedWithCustomError(editions, "RenounceDisabled");
      await expect(
        editions.connect(stranger).renounceOwnership()
      ).to.be.revertedWithCustomError(editions, "RenounceDisabled");
      expect(await editions.owner()).to.equal(deployer.address);
    });

    it("renounceOwnership stays disabled while paused (no orphaned pause)", async function () {
      await editions.pause();
      await expect(
        editions.renounceOwnership()
      ).to.be.revertedWithCustomError(editions, "RenounceDisabled");
      await editions.unpause();
    });
  });
});
