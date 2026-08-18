// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title AtelierEditions
 * @author Dozier Tech Group
 * @notice ERC-1155 editions with per-id supply caps. An edition must be
 *         created — with a cap — before a single unit can be minted, and a
 *         cap can never be raised, reused, or removed. The URI can be edited
 *         until `freezeURI()` is called; after that it is permanent.
 *         Royalties (ERC-2981) are hard-capped at 10% in bytecode.
 * @dev No proxies, no upgradeability, no assembly, no `delegatecall`, no
 *      hidden mint paths: `mint` is the only issuance route and it checks the
 *      per-id cap against `ERC1155Supply` on every call. Ownership transfer
 *      is two-step. Pausing blocks mint and transfer alike via `_update`.
 */
contract AtelierEditions is ERC1155, ERC2981, ERC1155Pausable, ERC1155Supply, Ownable2Step {
    // ---------------------------------------------------------------- errors

    /// @notice Thrown when creating an edition whose id already has a cap.
    error EditionExists();

    /// @notice Thrown when minting an edition that was never created.
    error EditionUnknown();

    /// @notice Thrown when a mint would push an edition past its cap.
    error MaxSupplyExceeded();

    /// @notice Thrown when touching the URI after `freezeURI()`.
    error URIIsFrozen();

    /// @notice Thrown when a royalty above `MAX_ROYALTY_BPS` is requested.
    error RoyaltyTooHigh();

    /// @notice Thrown when an edition is created with a zero cap.
    error ZeroMaxSupply();

    /// @notice Thrown on any call to `renounceOwnership()` — renouncing is disabled.
    error RenounceDisabled();

    // ---------------------------------------------------------------- events

    /// @notice Emitted exactly once, when the metadata URI becomes permanent.
    event URIFrozen();

    /// @notice Emitted when a new edition is opened with a permanent cap.
    event EditionCreated(uint256 indexed id, uint256 maxSupply);

    // ------------------------------------------------------------- constants

    /// @notice Royalty ceiling: 1000 bps = 10%. Compiled in, not configured.
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    // ----------------------------------------------------------------- state

    /// @notice True once `freezeURI()` has been called. Never goes back.
    bool public uriFrozen;

    /// @dev Per-edition supply cap. Zero means the edition does not exist.
    mapping(uint256 id => uint256 cap) private _editionMaxSupply;

    // ----------------------------------------------------------- constructor

    /**
     * @notice Deploys the editions contract with a capped royalty.
     * @param uri_ Initial metadata URI, with `{id}` substitution per ERC-1155.
     * @param royaltyBps_ Default royalty in basis points, at most 1000 (10%).
     * @param royaltyReceiver_ Address that receives ERC-2981 royalties.
     * @param owner_ Initial owner — the only address that can create editions,
     *        mint, pause, set the URI, or freeze it.
     */
    constructor(
        string memory uri_,
        uint96 royaltyBps_,
        address royaltyReceiver_,
        address owner_
    ) ERC1155(uri_) Ownable(owner_) {
        if (royaltyBps_ > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        _setDefaultRoyalty(royaltyReceiver_, royaltyBps_);
    }

    // ------------------------------------------------------------ owner-only

    /**
     * @notice Opens edition `id` with a permanent supply cap. Owner-only.
     * @dev One shot per id: reverts with `EditionExists` if the id already
     *      has a cap, and with `ZeroMaxSupply` for a zero cap. Caps can never
     *      be changed after creation.
     * @param id The edition id to create.
     * @param maxSupply The permanent cap for this edition. Must be > 0.
     */
    function createEdition(uint256 id, uint256 maxSupply) external onlyOwner {
        if (maxSupply == 0) revert ZeroMaxSupply();
        if (_editionMaxSupply[id] != 0) revert EditionExists();
        _editionMaxSupply[id] = maxSupply;
        emit EditionCreated(id, maxSupply);
    }

    /**
     * @notice Mints `amount` units of edition `id` to `to`. Owner-only.
     * @dev Reverts with `EditionUnknown` for an uncreated id, with
     *      `MaxSupplyExceeded` when `totalSupply(id) + amount` would cross
     *      the cap, and while paused.
     * @param to Recipient of the minted units.
     * @param id The edition to mint from.
     * @param amount Number of units to mint.
     */
    function mint(address to, uint256 id, uint256 amount) external onlyOwner {
        uint256 cap = _editionMaxSupply[id];
        if (cap == 0) revert EditionUnknown();
        if (totalSupply(id) + amount > cap) revert MaxSupplyExceeded();
        _mint(to, id, amount, "");
    }

    /**
     * @notice Points the contract at a new metadata URI. Owner-only.
     * @dev Reverts with `URIIsFrozen` once `freezeURI()` has been called.
     * @param newURI The new URI, with `{id}` substitution per ERC-1155.
     */
    function setURI(string calldata newURI) external onlyOwner {
        if (uriFrozen) revert URIIsFrozen();
        _setURI(newURI);
    }

    /**
     * @notice Makes the current URI permanent. Owner-only. Irreversible.
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
     *      call would zero the owner in a single step — no unpause, no
     *      editions, no URI control, ever again. Ownership moves only via
     *      the two-step `transferOwnership` / `acceptOwnership` handoff.
     */
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ----------------------------------------------------------------- views

    /**
     * @notice The permanent supply cap for edition `id`.
     * @param id The edition to query.
     * @return The cap, or 0 if the edition has not been created.
     */
    function editionMaxSupply(uint256 id) external view returns (uint256) {
        return _editionMaxSupply[id];
    }

    /**
     * @notice ERC-165 support: ERC-1155 plus ERC-2981.
     * @param interfaceId The interface identifier to query.
     * @return True if the interface is supported.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------- internals

    /// @dev Single choke point for every balance change. `ERC1155Pausable`
    ///      enforces `whenNotPaused` and `ERC1155Supply` keeps the per-id
    ///      totals that `mint` checks its caps against.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Pausable, ERC1155Supply) {
        super._update(from, to, ids, values);
    }
}
