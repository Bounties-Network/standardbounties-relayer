import Web3 from "web3";
const FALLBACK_WEB3_PROVIDER =
  process.env.REACT_APP_NETWORK || "http://0.0.0.0:8545";

const web3Networks = {
  "1": {
    name: "mainnet",
    explorerTx: "https://etherscan.io/tx",
    explorerAddress: "https://etherscan.io/address/",
    standardBounties: null,
    bountiesMetaTxRelayer: null
  },
  "3": {
    name: "ropsten",
    explorerTx: "https://ropsten.etherscan.io/tx/",
    explorerAddress: "https://ropsten.etherscan.io/address/",
    standardBounties: null,
    bountiesMetaTxRelayer: null
  },
  "4": {
    name: "rinkeby",
    explorerTx: "https://rinkeby.etherscan.io/tx/",
    explorerAddress: "https://rinkeby.etherscan.io/address/",
    standardBounties: "0x38f1886081759f7d352c28984908d04e8d2205a6",
    bountiesMetaTxRelayer: "0x0d12b3fa96b3aacedd06aba62c17cb5fc0e17627"
  }
};

const getWeb3 = () =>
  new Promise((resolve, reject) => {
    // Wait for loading completion to avoid race conditions with web3 injection timing.
    window.addEventListener("load", async () => {
      // Modern dapp browsers...
      if (window.ethereum) {
        const web3 = new Web3(window.ethereum);
        try {
          // Request account access if needed
          await window.ethereum.enable();
          // Acccounts now exposed
          resolve(web3);
        } catch (error) {
          reject(error);
        }
      }
      // Legacy dapp browsers...
      else if (window.web3) {
        // Use Mist/MetaMask's provider.
        const web3 = window.web3;
        console.log("Injected web3 detected.");
        resolve(web3);
      }
      // Fallback to localhost; use dev console port by default...
      else {
        const provider = new Web3.providers.HttpProvider(
          FALLBACK_WEB3_PROVIDER
        );
        const web3 = new Web3(provider);
        console.log("No web3 instance injected, using Infura/Local web3.");
        resolve(web3);
      }
    });
  });

const getGanacheWeb3 = () => {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    return null;
  }
  const provider = new Web3.providers.HttpProvider("http://0.0.0.0:8545");
  const web3 = new Web3(provider);
  console.log("No local ganache found.");
  return web3;
};

export default getWeb3;
export { getGanacheWeb3, web3Networks };