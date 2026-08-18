// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title AtelierDrop
 * @author Dozier Tech Group
 * @notice A fixed-size ERC-721 collection with sequential token IDs starting
 *         at 1. Minting is owner-only and batched. The base URI can be edited
 *         until `freezeURI()` is called — after that the metadata pointer is
 *         permanent, with no override and no backdoor. Royalties (ERC-2981)
 *         are hard-capped at 10% in bytecode.
 * @dev The playbook behind Silicon Bayou (198 gators, Robinhood Chain),
 *      generalized. No proxies, no upgradeability, no assembly, no
 *      `delegatecall`, no hidden mint paths: `mintBatch` is the only way a
 *      token comes into existence. Ownership transfer is two-step. Pausing
 *      blocks mint and transfer alike via the `_update` override.
 */
contract AtelierDrop is ERC721, ERC2981, Ownable2Step, Pausable {
    using Strings for uint256;

    // ---------------------------------------------------------------- errors

    /// @notice Thrown when a mint would push `totalMinted()` past `maxSupply`.
    error MaxSupplyExceeded();

    /// @notice Thrown when a single batch asks for more than `MAX_BATCH`.
    error BatchTooLarge();

    /// @notice Thrown when touching the base URI after `freezeURI()`.
    error URIIsFrozen();

    /// @notice Thrown when a royalty above `MAX_ROYALTY_BPS` is requested.
    error RoyaltyTooHigh();

    /// @notice Thrown when the constructor is given a zero max supply.
    error ZeroMaxSupply();

    /// @notice Thrown on any call to `renounceOwnership()` — renouncing is disabled.
    error RenounceDisabled();

    // ---------------------------------------------------------------- events

    /// @notice Emitted exactly once, when the metadata pointer becomes permanent.
    event URIFrozen();

    /// @notice Emitted whenever the base URI changes (only possible pre-freeze).
    event BaseURIUpdated(string newBaseURI);

    // ------------------------------------------------------------- constants

    /// @notice Upper bound on tokens per `mintBatch` call. Keeps gas honest.
    uint256 public constant MAX_BATCH = 50;

    /// @notice Royalty ceiling: 1000 bps = 10%. Compiled in, not configured.
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    // ----------------------------------------------------------------- state

    /// @notice The collection size. Immutable — fixed at deployment, forever.
    uint256 public immutable maxSupply;

    /// @notice True once `freezeURI()` has been called. Never goes back.
    bool public uriFrozen;

    /// @dev Prefix for `tokenURI`; token id + ".json" is appended.
    string private _baseTokenURI;

    /// @dev Count of tokens minted so far. Doubles as the last-issued id.
    uint256 private _totalMinted;

    // ----------------------------------------------------------- constructor

    /**
     * @notice Deploys the collection with a permanent size and a capped royalty.
     * @param name_ ERC-721 name.
     * @param symbol_ ERC-721 symbol.
     * @param baseURI_ Initial metadata prefix, e.g. "ipfs://<CID>/".
     * @param maxSupply_ Collection size. Must be > 0. Cannot change.
     * @param royaltyBps_ Default royalty in basis points, at most 1000 (10%).
     * @param royaltyReceiver_ Address that receives ERC-2981 royalties.
     * @param owner_ Initial owner — the only address that can mint, pause,
     *        set the URI, or freeze it.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        uint256 maxSupply_,
        uint96 royaltyBps_,
        address royaltyReceiver_,
        address owner_
    ) ERC721(name_, symbol_) Ownable(owner_) {
        if (maxSupply_ == 0) revert ZeroMaxSupply();
        if (royaltyBps_ > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        maxSupply = maxSupply_;
        _baseTokenURI = baseURI_;
        _setDefaultRoyalty(royaltyReceiver_, royaltyBps_);
    }

    // ------------------------------------------------------------ owner-only

    /**
     * @notice Mints `count` sequential tokens to `to`. Owner-only.
     * @dev Token IDs start at 1 and never skip. Reverts with `BatchTooLarge`
     *      above `MAX_BATCH`, with `MaxSupplyExceeded` past the cap, and
     *      while paused. Uses `_safeMint`, so a contract recipient must
     *      implement `onERC721Received`.
     * @param to Recipient of every token in the batch.
     * @param count Number of tokens to mint (at most `MAX_BATCH`).
     */
    function mintBatch(address to, uint256 count) external onlyOwner {
        if (count > MAX_BATCH) revert BatchTooLarge();
        uint256 minted = _totalMinted;
        if (minted + count > maxSupply) revert MaxSupplyExceeded();
        _totalMinted = minted + count;
        for (uint256 i = 1; i <= count; ++i) {
            _safeMint(to, minted + i);
        }
    }

    /**
     * @notice Points the collection at a new metadata prefix. Owner-only.
     * @dev Reverts with `URIIsFrozen` once `freezeURI()` has been called.
     * @param newBaseURI The new prefix, e.g. "ipfs://<CID>/".
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        if (uriFrozen) revert URIIsFrozen();
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @notice Makes the current base URI permanent. Owner-only. Irreversible.
     * @dev There is no unfreeze. Check the metadata before you call this.
     */
    function freezeURI() external onlyOwner {
        if (uriFrozen) revert URIIsFrozen();
        uriFrozen = true;
        emit URIFrozen();
    }

    /**
     * @notice Sets the ERC-2981 default royalty. Owner-only.
     * @dev Capped at `MAX_ROYALTY_BPS` (10%) — the cap is bytecode and cannot
     *      be lifted by anyone, including the owner.
     * @param receiver Address that receives royalties.
     * @param royaltyBps Royalty in basis points, at most 1000.
     */
    function setDefaultRoyalty(address receiver, uint96 royaltyBps) external onlyOwner {
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        _setDefaultRoyalty(receiver, royaltyBps);
    }

    /**
     * @notice Halts all mints and transfers. Owner-only. Emergency use.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resumes mints and transfers. Owner-only.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Disabled. Always reverts with `RenounceDisabled`.
     * @dev `Ownable2Step` leaves `Ownable.renounceOwnership` reachable: one
     *      call would zero the owner in a single step — no unpause, no mint,
     *      no URI control, ever again. Ownership moves only via the two-step
     *      `transferOwnership` / `acceptOwnership` handoff.
     */
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ----------------------------------------------------------------- views

    /**
     * @notice Number of tokens minted so far. Never decreases.
     * @return The mint count (also the highest token id issued).
     */
    function totalMinted() external view returns (uint256) {
        return _totalMinted;
    }

    /**
     * @notice The current metadata prefix.
     * @return The base URI that `tokenURI` builds on.
     */
    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @notice Metadata URI for `tokenId`: `{baseURI}{id}.json`.
     * @dev Reverts for tokens that have not been minted.
     * @param tokenId The token to resolve.
     * @return The full metadata URI.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString(), ".json");
    }

    /**
     * @notice ERC-165 support: ERC-721 plus ERC-2981.
     * @param interfaceId The interface identifier to query.
     * @return True if the interface is supported.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------- internals

    /// @dev Single choke point for every ownership change. `whenNotPaused`
    ///      here blocks mint, transfer, and burn while the contract is paused.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override whenNotPaused returns (address) {
        return super._update(to, tokenId, auth);
    }
}
