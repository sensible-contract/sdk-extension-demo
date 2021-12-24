import * as bsv from "@sensible-contract/bsv";
import {
  createBidTx,
  createNftAuctionContractTx,
  createNftForAuctionContractTx,
  createWithdrawTx,
  getNftAuctionInput,
  getNftAuctionUtxo,
  WitnessOracle,
} from "@sensible-contract/nft-auction-js";
import {
  createNftTransferTx,
  createNftUnlockCheckContractTx,
  getNftInput,
} from "@sensible-contract/nft-js";
import { NFT_UNLOCK_CONTRACT_TYPE } from "@sensible-contract/nft-js/lib/contract-factory/nftUnlockContractCheck";
import {
  createBuyNftTx,
  createCancelSellNftTx,
  createNftSellContractTx,
  getSellInput,
} from "@sensible-contract/nft-sell-js";
import {
  getNftSigner,
  NFT,
  Sensible as ParentSensible,
  TxOptions,
} from "@sensible-contract/sensible-sdk-v2";
import { TxComposer } from "@sensible-contract/tx-composer";
const DEFAULT_TX_OPTIONS: TxOptions = {
  onlyEstimateFee: false,
  noBroadcast: false,
};

async function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(0);
    }, time * 1000);
  });
}

export class Sensible extends ParentSensible {
  //nft-auction
  async startNftAuction(
    {
      nft,
      startBsvPrice,
      endTimeStamp,
      feeAddress,
      feeAmount,
    }: {
      nft: NFT;
      startBsvPrice: number;
      endTimeStamp: number;
      feeAddress: string;
      feeAmount: number;
    },
    options: TxOptions = DEFAULT_TX_OPTIONS
  ) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );
    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };
    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });

    let fee1 = createNftAuctionContractTx.estimateFee({
      utxoMaxCount: utxos.length,
    });
    let fee2Ret = await this.transferNft(
      { nft, receiverAddress: address },
      { onlyEstimateFee: true }
    );
    let fee = fee1 + fee2Ret.fee;
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";

    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);
    let { auctionContractHash, txComposer } = await createNftAuctionContractTx({
      nftSigner,
      witnessOracle: new WitnessOracle(),
      nftInput,
      feeAddress,
      feeAmount,
      senderAddress: address,
      startBsvPrice,
      endTimeStamp,
      utxos,
    });
    let sigResults = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults);

    utxos = [txComposer.getChangeUtxo()];

    //just for getting address
    let { nftForAuctionAddress } = await createNftForAuctionContractTx(
      this.provider,
      {
        nftInput,
        auctionContractHash,
        utxos,
      }
    );

    let transferNftResult = await this.transferNft(
      { nft, receiverAddress: nftForAuctionAddress },
      {
        noBroadcast: true,
      }
    );

    if (options.noBroadcast) {
      return { rawtxs: [txComposer.getRawHex(), transferNftResult.rawtx] };
    } else {
      let txid1 = await this.provider.broadcast(txComposer.getRawHex());
      let txid2 = await this.provider.broadcast(transferNftResult.rawtx);
      return { txids: [txid1, txid2] };
    }
  }

  async bidInNftAuction(
    {
      nft,
      bsvBidPrice,
    }: {
      nft: NFT;
      bsvBidPrice: number;
    },
    options: TxOptions = DEFAULT_TX_OPTIONS
  ) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );

    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };

    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });
    let nftAuctionUtxo = await getNftAuctionUtxo(this.provider, {
      nftID: nftInput.nftID,
    });

    let nftAuctionInput = await getNftAuctionInput(this.provider, {
      nftAuctionUtxo,
    });

    let fee = createBidTx.estimateFee({
      nftAuctionInput,
      utxoMaxCount: utxos.length,
    });
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";

    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);
    let { txComposer } = await createBidTx({
      nftSigner,
      witnessOracle: new WitnessOracle(),
      nftAuctionInput,
      bsvBidPrice,
      bidderAddress: address,
      utxos,
    });

    let sigResults = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults);

    if (options.noBroadcast) {
      return { rawtx: txComposer.getRawHex() };
    } else {
      let txid = await this.provider.broadcast(txComposer.getRawHex());
      return { txid };
    }
  }

  async withdrawInNftAuction(
    {
      nft,
    }: {
      nft: NFT;
    },
    options: TxOptions = DEFAULT_TX_OPTIONS
  ) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );
    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };
    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });

    let nftAuctionUtxo = await getNftAuctionUtxo(this.provider, {
      nftID: nftInput.nftID,
    });
    let nftAuctionInput = await getNftAuctionInput(this.provider, {
      nftAuctionUtxo,
    });

    let nftUnlockType = NFT_UNLOCK_CONTRACT_TYPE.OUT_6;

    let fee1 = createNftForAuctionContractTx.estimateFee({
      utxoMaxCount: utxos.length,
    });
    let fee2 = createNftUnlockCheckContractTx.estimateFee({
      nftUnlockType,
      utxoMaxCount: 1,
    });
    let fee3 = createWithdrawTx.estimateFee({
      nftAuctionInput,
      nftInput,
      utxoMaxCount: 1,
    });
    let fee = fee1 + fee2 + fee3;
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";
    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);

    let nftForAuctionRet = await createNftForAuctionContractTx(this.provider, {
      nftInput,
      auctionContractHash: bsv.crypto.Hash.sha256ripemd160(
        nftAuctionInput.lockingScript.toBuffer()
      ).toString("hex"),
      utxos,
    });

    let sigResults0 = await this.wallet.signTransaction(
      nftForAuctionRet.txComposer.getRawHex(),
      nftForAuctionRet.txComposer.getInputInfos()
    );
    nftForAuctionRet.txComposer.unlock(sigResults0);

    utxos = [nftForAuctionRet.txComposer.getChangeUtxo()];

    let unlockCheckRet = await createNftUnlockCheckContractTx({
      nftUnlockType,
      codehash: nftInput.codehash,
      nftID: nftInput.nftID,
      utxos,
    });

    let sigResults1 = await this.wallet.signTransaction(
      unlockCheckRet.txComposer.getRawHex(),
      unlockCheckRet.txComposer.getInputInfos()
    );
    unlockCheckRet.txComposer.unlock(sigResults1);

    utxos = [unlockCheckRet.txComposer.getChangeUtxo()];

    let { txComposer } = await createWithdrawTx({
      nftSigner,
      witnessOracle: new WitnessOracle(),
      nftInput,
      nftAuctionInput,
      nftForAuctionContract: nftForAuctionRet.nftForAuctionContract,
      nftForAuctionTxComposer: nftForAuctionRet.txComposer,
      nftUnlockCheckContract: unlockCheckRet.unlockCheckContract,
      nftUnlockCheckTxComposer: unlockCheckRet.txComposer,
      utxos,
    });

    let sigResults2 = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults2);

    if (options.noBroadcast) {
      return {
        rawtxs: [
          nftForAuctionRet.txComposer.getRawHex(),
          unlockCheckRet.txComposer.getRawHex(),
          txComposer.getRawHex(),
        ],
      };
    } else {
      let txid1 = await this.provider.broadcast(
        nftForAuctionRet.txComposer.getRawHex()
      );
      let txid2 = await this.provider.broadcast(
        unlockCheckRet.txComposer.getRawHex()
      );
      let txid3 = await this.provider.broadcast(txComposer.getRawHex());
      return { txids: [txid1, txid2, txid3] };
    }
  }

  //nft-sell
  async sellNft(
    { nft, satoshisPrice }: { nft: NFT; satoshisPrice: number },
    options: TxOptions = DEFAULT_TX_OPTIONS
  ) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let fee1 = createNftSellContractTx.estimateFee({
      utxoMaxCount: utxos.length,
    });
    let _res = await this.transferNft({ nft }, { onlyEstimateFee: true });
    let fee = fee1 + _res.fee;
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );
    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };
    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });

    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);

    let nftSellRet = await createNftSellContractTx({
      nftInput,
      satoshisPrice,
      utxos,
    });
    let sigResults = await this.wallet.signTransaction(
      nftSellRet.txComposer.getRawHex(),
      nftSellRet.txComposer.getInputInfos()
    );
    nftSellRet.txComposer.unlock(sigResults);

    utxos = [nftSellRet.txComposer.getChangeUtxo()];

    let { txComposer } = await createNftTransferTx({
      nftSigner,
      nftInput,
      receiverAddress: nftSellRet.sellAddress,
      utxos,
    });
    let sigResults2 = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults2);

    if (options.noBroadcast) {
      return {
        rawtxs: [nftSellRet.txComposer.getRawHex(), txComposer.getRawHex()],
      };
    } else {
      let txid1 = await this.provider.broadcast(
        nftSellRet.txComposer.getRawHex()
      );
      let txid2 = await this.provider.broadcast(txComposer.getRawHex());
      return { txids: [txid1, txid2] };
    }
  }

  async cancelSellNft(
    { nft }: { nft: NFT },
    options: TxOptions = DEFAULT_TX_OPTIONS
  ) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );
    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };
    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });

    let nftUnlockType = NFT_UNLOCK_CONTRACT_TYPE.OUT_6;

    let fee1 = createNftUnlockCheckContractTx.estimateFee({
      nftUnlockType,
      utxoMaxCount: utxos.length,
    });
    let fee2 = createCancelSellNftTx.estimateFee({
      nftInput,
      utxoMaxCount: 1,
    });
    let fee = fee1 + fee2;
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";

    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);

    let sellUtxo = (
      await this.provider.getNftSellUtxoDetail(
        nft.codehash,
        nft.genesis,
        nft.tokenIndex,
        {
          ready: true,
        }
      )
    ).map((v) => ({
      txId: v.txid,
      outputIndex: v.vout,
      sellerAddress: v.address,
      satoshisPrice: v.price,
    }))[0];

    let { sellInput, nftSellContract } = await getSellInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      tokenIndex: nft.tokenIndex,
      sellUtxo,
    });

    let nftSellTxComposer = new TxComposer(
      new bsv.Transaction(sellInput.txHex)
    );
    let unlockCheckRet = await createNftUnlockCheckContractTx({
      nftUnlockType,
      codehash: nft.codehash,
      nftID: nftInput.nftID,
      utxos,
    });

    let sigResults = await this.wallet.signTransaction(
      unlockCheckRet.txComposer.getRawHex(),
      unlockCheckRet.txComposer.getInputInfos()
    );
    unlockCheckRet.txComposer.unlock(sigResults);

    utxos = [unlockCheckRet.txComposer.getChangeUtxo()];

    let { txComposer } = await createCancelSellNftTx({
      nftSigner,
      nftInput,
      nftSellContract,
      nftSellTxComposer,
      nftUnlockCheckContract: unlockCheckRet.unlockCheckContract,
      nftUnlockCheckTxComposer: unlockCheckRet.txComposer,
      utxos,
    });

    let sigResults2 = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults2);

    if (options.noBroadcast) {
      return {
        rawtxs: [unlockCheckRet.txComposer.getRawHex(), txComposer.getRawHex()],
      };
    } else {
      let txid1 = await this.provider.broadcast(
        unlockCheckRet.txComposer.getRawHex()
      );
      let txid2 = await this.provider.broadcast(txComposer.getRawHex());
      return { txids: [txid1, txid2] };
    }
  }

  async buyNft({ nft }: { nft: NFT }, options: TxOptions = DEFAULT_TX_OPTIONS) {
    let address = await this.wallet.getAddress();
    let publicKey = await this.wallet.getPublicKey();
    let utxos = await this.provider.getUtxos(address);

    let nftUtxoDetail = await this.provider.getNftUtxoDetail(
      nft.codehash,
      nft.genesis,
      nft.tokenIndex
    );
    let nftUtxo = {
      txId: nftUtxoDetail.txid,
      outputIndex: nftUtxoDetail.vout,
      tokenAddress: nftUtxoDetail.address,
      tokenIndex: nftUtxoDetail.tokenIndex,
    };
    let nftInput = await getNftInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      nftUtxo,
    });

    let sellUtxo = (
      await this.provider.getNftSellUtxoDetail(
        nft.codehash,
        nft.genesis,
        nft.tokenIndex,
        {
          ready: true,
        }
      )
    ).map((v) => ({
      txId: v.txid,
      outputIndex: v.vout,
      sellerAddress: v.address,
      satoshisPrice: v.price,
    }))[0];

    let { sellInput, nftSellContract } = await getSellInput(this.provider, {
      codehash: nft.codehash,
      genesis: nft.genesis,
      tokenIndex: nft.tokenIndex,
      sellUtxo,
    });

    let nftUnlockType = NFT_UNLOCK_CONTRACT_TYPE.OUT_6;

    let fee1 = createNftUnlockCheckContractTx.estimateFee({
      nftUnlockType,
      utxoMaxCount: utxos.length,
    });
    let fee2 = createBuyNftTx.estimateFee({
      nftInput,
      sellInput,
      utxoMaxCount: 1,
    });
    let fee = fee1 + fee2;
    let balance = utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
    if (options.onlyEstimateFee) return { fee };
    if (balance < fee) throw "Insufficient Bsv Balance.";
    let nftSigner = await getNftSigner(nftInput.rabinPubKeyHashArrayHash);

    let nftSellTxComposer = new TxComposer(
      new bsv.Transaction(sellInput.txHex)
    );
    let unlockCheckRet = await createNftUnlockCheckContractTx({
      nftUnlockType,
      codehash: nft.codehash,
      nftID: nftInput.nftID,
      utxos,
    });

    let sigResults = await this.wallet.signTransaction(
      unlockCheckRet.txComposer.getRawHex(),
      unlockCheckRet.txComposer.getInputInfos()
    );
    unlockCheckRet.txComposer.unlock(sigResults);

    utxos = [unlockCheckRet.txComposer.getChangeUtxo()];

    let { txComposer } = await createBuyNftTx({
      nftSigner,
      nftInput,
      nftSellContract,
      nftSellTxComposer,
      nftUnlockCheckContract: unlockCheckRet.unlockCheckContract,
      nftUnlockCheckTxComposer: unlockCheckRet.txComposer,
      utxos,
    });

    let sigResults2 = await this.wallet.signTransaction(
      txComposer.getRawHex(),
      txComposer.getInputInfos()
    );
    txComposer.unlock(sigResults2);

    if (options.noBroadcast) {
      return {
        rawtxs: [unlockCheckRet.txComposer.getRawHex(), txComposer.getRawHex()],
      };
    } else {
      let txid1 = await this.provider.broadcast(
        unlockCheckRet.txComposer.getRawHex()
      );
      let txid2 = await this.provider.broadcast(txComposer.getRawHex());
      return { txids: [txid1, txid2] };
    }
  }
}
