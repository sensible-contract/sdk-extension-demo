import { LocalWallet } from "@sensible-contract/wallets";
import Web3 from "../src";

let CREATURE = {
  codehash: "22519e29424dc4b94b9273b6500ebadad7b9ad02",
  genesis: "f3ac15d9e40ff55c79517065f7c02bd6121f592c",
  tokenIndex: "24",
};

let wallet = LocalWallet.fromWIF("xxxxx");
let web3 = new Web3(wallet);
let address = "16dpFB5oUCL9Cj2Mq9fUEJCLLqTzn6bQQg";

async function sell() {
  let { txids } = await web3.sensible.sellNft({
    nft: CREATURE,
    satoshisPrice: 500,
  });
  console.log("sellNft", txids);
}

async function cancelSell() {
  let { txids } = await web3.sensible.cancelSellNft({
    nft: CREATURE,
  });
  console.log("cancelSellNft", txids);
}

async function buy() {
  let { txids } = await web3.sensible.buyNft({
    nft: CREATURE,
  });
  console.log("buy", txids);
}
async function run() {
  try {
    // await sell();
    await cancelSell();
    // await buy();
  } catch (e) {
    console.log(e);
  }
}
run();
