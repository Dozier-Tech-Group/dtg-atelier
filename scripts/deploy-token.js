/**
 * Deploy AtelierToken (ERC-20) from drop.config.json.
 *
 *   npx hardhat run scripts/deploy-token.js --network robinhoodTestnet
 *
 * Safety rails (do not remove):
 *   - Refuses mainnet chain IDs (4663, 8453) unless I_UNDERSTAND_MAINNET=1.
 *   - Validates every constructor arg before anything is sent.
 *   - Prints a full pre-flight summary before deploying.
 *   - NEVER logs the private key. Nothing in this file reads
 *     process.env.PRIVATE_KEY — hardhat.config.js handles the signer.
 *   - Writes a deployment record to deployments/<network>-AtelierToken.json.
 */

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "drop.config.json");
const MAINNET_CHAIN_IDS = [4663, 8453];

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
  const cfg = loadSection("token");

  // ---- validate constructor args before touching the network ----
  if (typeof cfg.name !== "string" || cfg.name.trim() === "") {
    fail("token.name must be a non-empty string.");
  }
  if (typeof cfg.symbol !== "string" || cfg.symbol.trim() === "") {
    fail("token.symbol must be a non-empty string.");
  }
  const decimals = Number(cfg.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    fail("token.decimals must be an integer between 0 and 255 (18 is the convention).");
  }
  let maxSupplyUnits;
  try {
    // Config value is in WHOLE tokens; the contract takes base units.
    maxSupplyUnits = ethers.parseUnits(String(cfg.maxSupply), decimals);
  } catch (err) {
    fail(`token.maxSupply ("${cfg.maxSupply}") is not a valid amount: ${err.message}`);
  }
  if (maxSupplyUnits <= 0n) {
    fail("token.maxSupply must be > 0. The contract reverts on a zero cap.");
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

  const owner = deployer.address; // owner defaults to the deployer
  const args = [cfg.name, cfg.symbol, decimals, maxSupplyUnits, owner];
  const balance = await ethers.provider.getBalance(deployer.address);

  // ---- pre-flight summary ----
  console.log("");
  console.log("== Pre-flight: AtelierToken (ERC-20) ==");
  console.log(`  network:  ${network.name}`);
  console.log(`  chainId:  ${chainId}`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  balance:  ${ethers.formatEther(balance)} ETH`);
  console.log("  constructor args:");
  console.log(`    name_:      ${cfg.name}`);
  console.log(`    symbol_:    ${cfg.symbol}`);
  console.log(`    decimals_:  ${decimals}`);
  console.log(`    maxSupply_: ${maxSupplyUnits} base units (${cfg.maxSupply} whole tokens)`);
  console.log(`    owner_:     ${owner} (deployer)`);
  console.log("");

  // ---- deploy ----
  const factory = await ethers.getContractFactory("AtelierToken", deployer);
  const contract = await factory.deploy(...args);
  const deployTx = contract.deploymentTransaction();
  console.log(`  tx sent: ${deployTx.hash}`);
  await contract.waitForDeployment();
  const receipt = await deployTx.wait();
  const address = await contract.getAddress();

  // ---- record ----
  const file = writeRecord("AtelierToken", {
    contract: "AtelierToken",
    network: network.name,
    chainId,
    address,
    txHash: receipt.hash,
    block: receipt.blockNumber,
    deployer: deployer.address,
    constructorArgs: {
      name_: cfg.name,
      symbol_: cfg.symbol,
      decimals_: decimals,
      maxSupply_: maxSupplyUnits,
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
  console.log("and confirm decimals/maxSupply read back exactly as printed above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
