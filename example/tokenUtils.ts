import { Wallet } from "@sensible-contract/abstract-wallet";
import * as bsv from "@sensible-contract/bsv";
import { SensiblequeryProvider } from "@sensible-contract/providers";
import { TxComposer } from "@sensible-contract/tx-composer";
import { LocalWallet } from "@sensible-contract/wallets";
import { Sensible } from "../src";

let DPC = {
  codehash: "777e4dd291059c9f7a0fd563f7204576dcceb791",
  genesis: "7158418fe81399c5556b8e35a33ed0ae7dab38f9",
  decimal: 6,
};

let TC1 = {
  codehash: "777e4dd291059c9f7a0fd563f7204576dcceb791",
  genesis: "acc86db7316112d91664d0525fa05915f8ce52c6",
  decimal: 3,
};

export class CustomWallet extends LocalWallet {
  address: string;
  constructor(privateKey: bsv.PrivateKey, network?: bsv.Networks.Type) {
    super(privateKey, network);
    this.address = this.privateKey.toAddress(network).toString();
  }
}

//生成随机助记词
function generateMnemonic() {
  let mne = new bsv.Mnemonic("");
  return mne.toString();
}

//根据助记词获取衍生地址的私钥钱包
export function getDeriveWallet(mnemonic: string, deriveIndex: number) {
  let mne = new bsv.Mnemonic(mnemonic);
  return new CustomWallet(
    mne
      .toHDPrivateKey("", "mainnet")
      .deriveChild("m/44'/0'/0'/0/" + deriveIndex).privateKey
  );
}

export function getWIFWallet(wif: string) {
  return new CustomWallet(new bsv.PrivateKey(wif));
}

//由player支付bsv手续费，从system转出token
export async function transferTokenToPlayer(
  playerWallet: Wallet,
  systemWallet: Wallet
) {
  //前端
  let provider = new SensiblequeryProvider();
  let sensible = new Sensible(provider, playerWallet);
  let { txComposerObject, sigResults1, inputInfos2 } =
    await sensible.transferTokenWithOtherFee({
      token: TC1,
      receivers: [
        {
          address: await playerWallet.getAddress(),
          amount: "100",
        },
      ],
      systemAddress: await systemWallet.getAddress(),
    });

  //后端
  let txComposer = TxComposer.fromObject(txComposerObject);
  let sigResults = await systemWallet.signTransaction(
    txComposer.getRawHex(),
    inputInfos2
  );
  txComposer.unlock(sigResults.concat(sigResults1));
  let txid = await provider.broadcast(txComposer.getRawHex());
  console.log("transfer success", txid);
}

//从system转出token和bsv到庄家和平台汇集地址
export async function transferTokenToUser(
  systemWallet: Wallet,
  bankerAddress: string,
  assembleAddress: string
) {
  let provider = new SensiblequeryProvider();
  let sensible = new Sensible(provider, systemWallet);
  let { txids } = await sensible.transferToken({
    token: DPC,
    receivers: [
      {
        address: bankerAddress,
        amount: "700",
      },
      {
        address: assembleAddress,
        amount: "100",
      },
    ],
  });

  console.log("transfer success", txids);
}

//合并钱包的token utxos
export async function merge(systemWallet: Wallet) {
  let provider = new SensiblequeryProvider();
  let sensible = new Sensible(provider, systemWallet);
  await sensible.mergeToken(DPC, 20); //20个就合并一次
}

type TxOutputInfo = {
  address: string;
  amount: string;
  type: "token" | "bsv";
  token?: {
    codehash: string;
    genesis: string;
  };
};

//获取交易的输出信息
export async function getTxOutputInfos(txid: string) {
  let provider = new SensiblequeryProvider();
  let outputInfos: TxOutputInfo[] = [];
  let _res = await provider.getTxOuts(txid, {
    cursor: 0,
    size: 100,
  });

  _res.forEach((v) => {
    if (v.scriptType == "76a91488ac") {
      outputInfos.push({
        address: v.address,
        amount: v.satoshi.toString(),
        type: "bsv",
      });
    } else {
      if (v.codehash != "") {
        outputInfos.push({
          address: v.address,
          amount: v.tokenAmount,
          type: "token",
          token: {
            codehash: v.codehash,
            genesis: v.genesis,
          },
        });
      }
    }
  });

  return outputInfos;
}

const run = async () => {
  try {
    let wallet2 = getWIFWallet(
      "L4xUZyQmKc48AEeTqNfBpTx8MKt92a9amjTyEThYjFhiYbrXt1G7"
    );
    let wallet3 = getWIFWallet(
      "KwEtzua6DS9bteRAEjCPvspypeyFhWhR5c5JqhjbbSP2Awk5oEX2"
    );
    await transferTokenToPlayer(wallet3, wallet2);
  } catch (e) {
    console.log(e);
  }
};

run();
