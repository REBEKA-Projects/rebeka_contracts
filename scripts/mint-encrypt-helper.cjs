/**
 * Helper CJS para cifrar un monto con cofhejs (evita "Dynamic require of stream" en ESM).
 * Uso: RPC_URL=... PRIVATE_KEY=... MINT_AMOUNT=100 node scripts/mint-encrypt-helper.cjs
 * Salida: una línea JSON con { ctHash, securityZone, utype, signature } para mintEncrypted.
 */
const { createPublicClient, createWalletClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { arbitrumSepolia } = require("viem/chains");
const { cofhejs, Encryptable } = require("cofhejs/node");

function getEnv(name, fallback) {
  const v = process.env[name];
  if (v) return v;
  const net = process.env.ENCRYPT_FOR_NETWORK || "arbitrumSepolia";
  // arbitrumSepolia -> ARBITRUM_SEPOLIA
  const prefix = net.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "");
  const alt = process.env[prefix + "_" + name];
  return alt || fallback;
}

async function main() {
  const rpcUrl = getEnv("RPC_URL");
  const pkHex = getEnv("PRIVATE_KEY");
  const mintAmount = BigInt(getEnv("MINT_AMOUNT", "100"));

  if (!rpcUrl || !pkHex) {
    process.stderr.write("Falta RPC_URL o PRIVATE_KEY (o ENCRYPT_FOR_NETWORK + ARBITRUM_SEPOLIA_RPC_URL etc.)\n");
    process.exit(1);
  }

  const chain = arbitrumSepolia;
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const account = privateKeyToAccount(pkHex.startsWith("0x") ? pkHex : `0x${pkHex}`);
  const walletClient = createWalletClient({ account, chain, transport });

  const initResult = await cofhejs.initializeWithViem({
    viemClient: publicClient,
    viemWalletClient: walletClient,
    environment: "TESTNET",
  });

  if (!initResult.success) {
    process.stderr.write("cofhejs init failed: " + (initResult.error?.message || "unknown") + "\n");
    process.exit(1);
  }

  const logState = (state) => process.stderr.write("  Encrypt state: " + state + "\n");
  const encryptResult = await cofhejs.encrypt([Encryptable.uint128(mintAmount)], logState);

  if (!encryptResult.success || !encryptResult.data?.[0]) {
    process.stderr.write("Encrypt failed: " + (encryptResult.error?.message || "no data") + "\n");
    process.exit(1);
  }

  const enc = encryptResult.data[0];
  const payload = {
    ctHash: enc.ctHash.toString(),
    securityZone: enc.securityZone,
    utype: enc.utype,
    signature: typeof enc.signature === "string" && !enc.signature.startsWith("0x") ? "0x" + enc.signature : enc.signature,
  };
  process.stdout.write(JSON.stringify(payload));
}

main().catch((err) => {
  process.stderr.write(err.message + "\n");
  process.exit(1);
});
