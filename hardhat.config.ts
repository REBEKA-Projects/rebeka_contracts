import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import { arbitrum, arbitrumSepolia } from "viem/chains";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    arbitrum: {
      type: "http",
      chainType: "l1",
      chainId: arbitrum.id,
      url: configVariable("ARBITRUM_RPC_URL"),
      accounts: [configVariable("ARBITRUM_PRIVATE_KEY")],
    },
    arbitrumSepolia: {
      type: "http",
      chainType: "l1",
      chainId: arbitrumSepolia.id,
      url: configVariable("ARBITRUM_SEPOLIA_RPC_URL"),
      accounts: [configVariable("ARBITRUM_SEPOLIA_PRIVATE_KEY")],
    },
  },
});
