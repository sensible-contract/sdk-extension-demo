import { Wallet } from "@sensible-contract/abstract-wallet";
import { SensiblequeryProvider } from "@sensible-contract/providers";
import PreWeb3 from "@sensible-contract/sensible-web3";
import { ExtentSensible } from "./sensible";
export default class Web3 extends PreWeb3 {
  sensible: ExtentSensible;
  constructor(wallet: Wallet, provider?: SensiblequeryProvider) {
    super(wallet, provider);
    this.sensible = new ExtentSensible(wallet, provider);
  }
}
