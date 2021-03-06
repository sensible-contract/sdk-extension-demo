import { LocalWallet } from "@sensible-contract/wallets";
import Web3 from "../src";

let CREATURE = {
  codehash: "22519e29424dc4b94b9273b6500ebadad7b9ad02",
  genesis: "f3ac15d9e40ff55c79517065f7c02bd6121f592c",
  tokenIndex: "28",
};

let wallet = LocalWallet.fromWIF("xxxx");
let web3 = new Web3(wallet);
let address = "16dpFB5oUCL9Cj2Mq9fUEJCLLqTzn6bQQg";

async function startNftAuction() {
  let { txids } = await web3.sensible.startNftAuction(
    {
      nft: CREATURE,
      startBsvPrice: 500,
      endTimeStamp: Date.now() + 5 * 60 * 1000,
      feeAddress: address,
      feeAmount: 450,
    },
    { noBroadcast: false }
  );
  console.log("startNftAuction", txids);
}

async function bid() {
  let { txid } = await web3.sensible.bidInNftAuction({
    nft: CREATURE,
    bsvBidPrice: 10002,
  });
  console.log("bid", txid);
}

async function withdraw() {
  let { txids } = await web3.sensible.withdrawInNftAuction({
    nft: CREATURE,
  });
  console.log("withdraw", txids);
}
async function run() {
  try {
    await startNftAuction();
    // await bid();
    // await withdraw();
  } catch (e) {
    console.log(e);
  }
}
run();
