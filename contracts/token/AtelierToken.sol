// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title AtelierToken
 * @author Dozier Tech Group
 * @notice A fixed-cap ERC-20. The cap is set once, in the constructor, as an
 *         immutable — it is bytecode, not a config value, and no code path can
 *         raise it. Minting is owner-only. Transfers and mints stop while
 *         paused. Permit (EIP-2612) is included so holders can approve by
 *         signature instead of a transaction.
 * @dev No proxies, no upgradeability, no assembly, no `delegatecall`.
 *      Ownership transfer is two-step: the new owner must call
 *      `acceptOwnership()` — a fat-fingered address cannot silently take the
 *      contract. Pausing is an emergency brake, not a feature: it blocks every
 *      `_update`, including mints.
 */
contract AtelierToken is ERC20, ERC20Pausable, ERC20Permit, Ownable2Step {
    // ---------------------------------------------------------------- errors

    /// @notice Thrown when a mint would push `totalSupply()` past `maxSupply`.
    error MaxSupplyExceeded();

    /// @notice Thrown when the constructor is given a zero cap.
    error ZeroMaxSupply();

    /// @notice Thrown on any call to `renounceOwnership()` — renouncing is disabled.
    error RenounceDisabled();

    // ----------------------------------------------------------------- state

    /// @notice The hard supply cap. Immutable — fixed at deployment, forever.
    uint256 public immutable maxSupply;

    /// @dev Decimals chosen at deployment; served by `decimals()`.
    uint8 private immutable _tokenDecimals;

    // ----------------------------------------------------------- constructor

    /**
     * @notice Deploys the token with a permanent supply cap.
     * @param name_ ERC-20 name (also the EIP-712 domain name for permits).
     * @param symbol_ ERC-20 symbol.
     * @param decimals_ Display decimals, fixed at deployment.
     * @param maxSupply_ Hard cap in base units. Must be > 0. Cannot change.
     * @param owner_ Initial owner — the only address that can mint or pause.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 maxSupply_,
        address owner_
    ) ERC20(name_, symbol_) ERC20Permit(name_) Ownable(owner_) {
        if (maxSupply_ == 0) revert ZeroMaxSupply();
        maxSupply = maxSupply_;
        _tokenDecimals = decimals_;
    }

    // ------------------------------------------------------------ owner-only

    /**
     * @notice Mints `amount` base units to `to`. Owner-only.
     * @dev Reverts with `MaxSupplyExceeded` if the cap would be crossed, and
     *      reverts while paused (the pause guard lives in `_update`).
     * @param to Recipient of the minted tokens.
     * @param amount Amount to mint, in base units.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > maxSupply) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /**
     * @notice Halts all transfers and mints. Owner-only. Emergency use.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resumes transfers and mints. Owner-only.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Disabled. Always reverts with `RenounceDisabled`.
     * @dev `Ownable2Step` leaves `Ownable.renounceOwnership` reachable: one
     *      call would zero the owner in a single step — no unpause and no
     *      minting under `maxSupply`, ever again. Ownership moves only via
     *      the two-step `transferOwnership` / `acceptOwnership` handoff.
     */
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ----------------------------------------------------------------- views

    /**
     * @notice Display decimals, as set in the constructor.
     * @return The immutable decimals value.
     */
    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    // ------------------------------------------------------------- internals

    /// @dev Single choke point for every balance change. `ERC20Pausable`
    ///      enforces `whenNotPaused` here, so mint, transfer, and burn all
    ///      stop the moment the contract is paused.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}
