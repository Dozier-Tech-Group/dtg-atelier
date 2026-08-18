/**
 * Deploy AtelierEditions (ERC-1155 editions) from drop.config.json.
 *
 *   npx hardhat run scripts/deploy-editions.js --network robinhoodTestnet
 *
 * Safety rails (do not remove):
 *   - Refuses mainnet chain IDs (4663, 8453) unless I_UNDERSTAND_MAINNET=1.
 *   - Validates every constructor arg before anything is sent
 *     (royaltyBps <= 1000, uri non-empty).
 *   - Prints a full pre-flight summary before deploying.
 *   - NEVER logs the private key. Nothing in this file reads
 *     process.env.PRIVATE_KEY — hardhat.config.js handles the signer.
 *   - Writes a deployment record to deployments/<network>-AtelierEditions.json.
 */

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "drop.config.json");
const MAINNET_CHAIN_IDS = [4663, 8453];
const MAX_ROYALTY_BPS = 1000; // mirrors the contract's hard cap (10%)

function fail(msg) {
  console.error(`\nDEPLOY ABORTED: ${msg}\n`);
  process.exit(1);
}

function loadSection(section) {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(
      `drop.config.json not found at ${CONFIG_PATH}.\n` +
        `Copy the example and edit it:\n` +
        `  PowerShell: Copy-Item drop.config.example.json drop.config.json\n` +
        `  bash:       cp drop.config.example.json drop.config.json`
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail(`drop.config.json is not valid JSON: ${err.message}`);
  }
  if (!cfg[section] || typeof cfg[section] !== "object") {
    fail(
      `drop.config.json has no "${section}" section. ` +
        `See drop.config.example.json for the expected shape.`
    );
  }
  return cfg[section];
}

function guardMainnet(chainId) {
  if (MAINNET_CHAIN_IDS.includes(chainId) && process.env.I_UNDERSTAND_MAINNET !== "1") {
    fail(
      `chainId ${chainId} is a MAINNET. This costs real money and cannot be undone.\n` +
        `Deploy and verify on a testnet first. When you are certain, set:\n` +
        `  PowerShell: $env:I_UNDERSTAND_MAINNET = "1"\n` +
        `  bash:       export I_UNDERSTAND_MAINNET=1\n` +
        `and run the exact same command again.`
    );
  }
}

function writeRecord(contractName, record) {
  const dir = path.join(ROOT, "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}-${contractName}.json`);
  const json = JSON.stringify(
    record,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );
  fs.writeFileSync(file, json + "\n");
  return file;
}

async function main() {
  const cfg = loadSection("editions");

  // ---- validate constructor args before touching the network ----
  if (typeof cfg.uri !== "string" || cfg.uri.trim() === "") {
    fail(
      'editions.uri must be a non-empty string, e.g. "ipfs://<CID>/{id}.json". ' +
        "The {id} placeholder is the ERC-1155 convention."
    );
  }
  const royaltyBps = Number(cfg.royaltyBps);
  if (!Number.isInteger(royaltyBps) || royaltyBps < 0) {
    fail("editions.royaltyBps must be a non-negative integer (basis points; 500 = 5%).");
  }
  if (royaltyBps > MAX_ROYALTY_BPS) {
    fail(
      `editions.royaltyBps is ${royaltyBps}; the contract hard-caps royalties at ` +
        `${MAX_ROYALTY_BPS} bps (10%). Lower it.`
    );
  }

  // ---- signer and network ----
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    fail(
      "No deployer account for this network. Set PRIVATE_KEY in .env.\n" +
        "Never commit .env. Never paste the key into chat, logs, or a config file."
    );
  }
  const deployer = signers[0];
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  guardMainnet(chainId);

  // royaltyReceiver defaults to the deployer when empty
  let royaltyReceiver = deployer.address;
  let receiverNote = "(deployer, default)";
  if (typeof cfg.royaltyReceiver === "string" && cfg.royaltyReceiver.trim() !== "") {
    if (!ethers.isAddress(cfg.royaltyReceiver)) {
      fail(`editions.royaltyReceiver ("${cfg.royaltyReceiver}") is not a valid address.`);
    }
    if (cfg.royaltyReceiver === ethers.ZeroAddress) {
      fail("editions.royaltyReceiver is the zero address. Royalties would burn.");
    }
    royaltyReceiver = ethers.getAddress(cfg.royaltyReceiver);
    receiverNote = "(from config)";
  }

  const owner = deployer.address; // owner defaults to the deployer
  const args = [cfg.uri, royaltyBps, royaltyReceiver, owner];
  const balance = await ethers.provider.getBalance(deployer.address);

  // ---- pre-flight summary ----
  console.log("");
  console.log("== Pre-flight: AtelierEditions (ERC-1155) ==");
  console.log(`  network:  ${network.name}`);
  console.log(`  chainId:  ${chainId}`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  balance:  ${ethers.formatEther(balance)} ETH`);
  console.log("  constructor args:");
  console.log(`    uri_:             ${cfg.uri}`);
  console.log(`    royaltyBps_:      ${royaltyBps} (${(royaltyBps / 100).toFixed(2)}%)`);
  console.log(`    royaltyReceiver_: ${royaltyReceiver} ${receiverNote}`);
  console.log(`    owner_:           ${owner} (deployer)`);
  console.log("");

  // ---- deploy ----
  const factory = await ethers.getContractFactory("AtelierEditions", deployer);
  const contract = await factory.deploy(...args);
  const deployTx = contract.deploymentTransaction();
  console.log(`  tx sent: ${deployTx.hash}`);
  await contract.waitForDeployment();
  const receipt = await deployTx.wait();
  const address = await contract.getAddress();

  // ---- record ----
  const file = writeRecord("AtelierEditions", {
    contract: "AtelierEditions",
    network: network.name,
    chainId,
    address,
    txHash: receipt.hash,
    block: receipt.blockNumber,
    deployer: deployer.address,
    constructorArgs: {
      uri_: cfg.uri,
      royaltyBps_: royaltyBps,
      royaltyReceiver_: royaltyReceiver,
      owner_: owner,
    },
    timestamp: new Date().toISOString(),
  });

  console.log("");
  console.log(`  deployed: ${address}`);
  console.log(`  block:    ${receipt.blockNumber}`);
  console.log(`  record:   ${path.relative(ROOT, file)}`);
  console.log("");
  console.log("Next: open the contract on the block explorer, verify the source,");
  console.log("then createEdition(id, maxSupply) before any mint — mint reverts");
  console.log("for editions that do not exist.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
