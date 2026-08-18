# Deploy scripts

Three Hardhat scripts, one config file. Each script reads `drop.config.json` at
the repo root, validates every constructor argument, prints a pre-flight
summary, deploys, and writes a record to `deployments/`.

| Script | Contract | Deploys |
|---|---|---|
| `deploy-token.js` | `AtelierToken` | ERC-20 with a hard supply cap |
| `deploy-drop.js` | `AtelierDrop` | ERC-721 collection, sequential IDs from 1 |
| `deploy-editions.js` | `AtelierEditions` | ERC-1155 editions, per-id caps |

## The flow

**1. Copy the config.**

```
Copy-Item drop.config.example.json drop.config.json   # PowerShell
cp drop.config.example.json drop.config.json          # bash
```

Edit `drop.config.json`. It is gitignored — your real drop parameters stay
local. Set `PRIVATE_KEY` in `.env` (also gitignored). Never commit `.env`.
Never paste a key into chat, a log, or a config file. The scripts never read
or print the key — `hardhat.config.js` owns the signer.

**2. Deploy to a testnet.**

```
npm run deploy:drop:testnet
```

(or `deploy:token:testnet`, `deploy:editions:testnet`). Read the pre-flight
summary line by line before the transaction confirms. If any argument looks
wrong, it is wrong — fix the config and rerun. Testnet mistakes cost nothing;
that is the point of this step.

**3. Verify on the explorer.**

Open the deployed address on the explorer for your network:

| Network | chainId | Explorer |
|---|---|---|
| robinhoodTestnet | 46630 | https://explorer.testnet.chain.robinhood.com |
| robinhood (mainnet) | 4663 | https://robinhoodchain.blockscout.com |
| sepolia | 11155111 | https://sepolia.etherscan.io |
| baseSepolia | 84532 | https://sepolia.basescan.org |
| base (mainnet) | 8453 | https://basescan.org |

Verify the source (Blockscout accepts standard-JSON upload; the exact
constructor args are in the `deployments/` record). Then read the state back:
`decimals`/`maxSupply` on the token, `tokenURI(1)` after a test mint on the
drop, `editionMaxSupply(id)` after `createEdition` on the editions contract.
If metadata does not resolve, do not go near mainnet.

**4. Mainnet — only after step 3 passes.**

Mainnet chain IDs **4663** (Robinhood) and **8453** (Base) are refused unless
you set:

```
$env:I_UNDERSTAND_MAINNET = "1"    # PowerShell
export I_UNDERSTAND_MAINNET=1      # bash
```

Then:

```
npm run deploy:drop:mainnet
```

Unset the variable when you are done. A mainnet deploy is permanent, costs
real money, and the contracts are not upgradeable — by design.

## Safety rails built into every script

- Mainnet refusal without `I_UNDERSTAND_MAINNET=1`.
- Constructor args validated before anything is sent: `maxSupply > 0`,
  `royaltyBps <= 1000` (the contract hard-caps at 10% anyway), `drop.baseURI`
  must end with `/` because `tokenURI` is `baseURI + "<id>.json"`.
- Full pre-flight summary: network, chainId, deployer, balance, every
  constructor argument.
- The private key is never logged and never read by the scripts.
- A deployment record is written to `deployments/<network>-<Contract>.json`
  with address, txHash, block, chainId, constructor args, and an ISO
  timestamp. Commit these records — they are the audit trail and the verify
  inputs.

## Config reference (`drop.config.json`)

| Key | Meaning |
|---|---|
| `token.name` / `token.symbol` | ERC-20 name and ticker |
| `token.decimals` | Usually 18. Stored immutable in the contract |
| `token.maxSupply` | **Whole tokens.** The script scales by `10^decimals` |
| `drop.name` / `drop.symbol` | Collection name and ticker |
| `drop.baseURI` | Must end with `/`. `tokenURI(id)` = `baseURI + id + ".json"` |
| `drop.maxSupply` | Token count, immutable hard cap |
| `drop.royaltyBps` | Basis points, max 1000 (10%). 500 = 5% |
| `drop.royaltyReceiver` | Address, or `""` to default to the deployer |
| `editions.uri` | ERC-1155 URI, e.g. `ipfs://<CID>/{id}.json` |
| `editions.royaltyBps` / `editions.royaltyReceiver` | Same rules as the drop |

Owner is always the deployer address. Transfer ownership after deploy with
`transferOwnership` + `acceptOwnership` (Ownable2Step) if the operating wallet
is not the deploy wallet.
