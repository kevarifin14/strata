import { AccountInfo, MintInfo, u64 } from "@solana/spl-token";
// @ts-ignore
import BN from "bn.js";

export type ExponentialCurveV0 = {
  pow: BN;
  frac: BN;
}

export function supplyAsNum(mint: MintInfo): number {
  return amountAsNum(mint.supply, mint);
}

export function asDecimal(percent: number): number {
  return percent / 4294967295 // uint32 max value
}

export function amountAsNum(amount: u64, mint: MintInfo): number {
  const decimals = new u64(Math.pow(10, mint.decimals).toString());
  const decimal = amount.mod(decimals).toNumber() / decimals.toNumber();
  return amount.div(decimals).toNumber() + decimal;
}

export function fromCurve(curve: any, baseStorage: AccountInfo, baseMint: MintInfo, targetMint: MintInfo): Curve {
  switch (Object.keys(curve.curve)[0]) {
    case "exponentialCurveV0": 
      return new ExponentialCurve(curve.c, curve.b, curve.curve.exponentialCurveV0 as ExponentialCurveV0, baseStorage, baseMint, targetMint)
  }

  throw new Error("Curve not found")
}

export interface Curve {
  current(): number
  locked(): number
  sellTargetAmount(targetAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number
  buyTargetAmount(targetAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number
  buyWithBaseAmount(baseAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number
}

export class ExponentialCurve implements Curve {
  c: number;
  b: number;
  k: number;
  baseStorage: AccountInfo;
  baseMint: MintInfo;
  targetMint: MintInfo;

  constructor(c: BN, b: BN, curve: ExponentialCurveV0, baseStorage: AccountInfo, baseMint: MintInfo, targetMint: MintInfo) {
    this.c = c.toNumber() / 1000000000000;
    this.b = b.toNumber() / 1000000000000;
    this.k = curve.pow.toNumber() / curve.frac.toNumber();

    this.baseStorage = baseStorage;
    this.baseMint = baseMint;
    this.targetMint = targetMint;
  }

  current(): number {
    return this.changeInTargetAmount(1, 0, 0);
  }

  locked(): number {
    return amountAsNum(this.baseStorage.amount, this.baseMint);
  }

  changeInTargetAmount(targetAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number {
    // Calculate with the actual target amount they will need to get the target amount after royalties
    const dS = (targetAmountNum * (1 / (1 - asDecimal(targetRoyaltiesPercent))));
    if (this.baseStorage.amount.toNumber() == 0 || this.targetMint.supply.toNumber() == 0) {
        // b dS + (c dS^(1 + k))/(1 + k)
        return ((this.b * dS) + ((this.c * Math.pow(dS, 1 + this.k)) / (1 + this.k))) * (1 / (1 - asDecimal(baseRoyaltiesPercent)));
    } else {
      /*
        (R / S^(1 + k)) ((S + dS)(S + dS)^k - S^(1 + k))
      */
     const R = amountAsNum(this.baseStorage.amount, this.baseMint)
     const S = supplyAsNum(this.targetMint);
     return ((R / Math.pow(S, 1 + this.k)) * ((S + dS) * Math.pow(S + dS, this.k) - Math.pow(S, 1 + this.k))) / (1 - asDecimal(baseRoyaltiesPercent));
    }
  }

  sellTargetAmount(targetAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number {
    return this.changeInTargetAmount(-targetAmountNum, baseRoyaltiesPercent, targetRoyaltiesPercent);
  }

  buyTargetAmount(targetAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number {
    return this.changeInTargetAmount(targetAmountNum, baseRoyaltiesPercent, targetRoyaltiesPercent);
  }

  buyWithBaseAmount(baseAmountNum: number, baseRoyaltiesPercent: number, targetRoyaltiesPercent: number): number {
    const dR = (baseAmountNum * (1 - asDecimal(baseRoyaltiesPercent)));
    if (this.baseStorage.amount.toNumber() == 0 || this.targetMint.supply.toNumber() == 0) {
      if (this.b == 0) {
        /*
         * (((1 + k) dR)/c)^(1/(1 + k))
         */
        return (Math.pow(((1 + this.k) * dR) / this.c, 1 / (1 + this.k))) + dR / this.b * (1 / (1 - asDecimal(targetRoyaltiesPercent)));
      } else if (this.k == 0) {
        return dR / this.b
      }

      throw new Error("Cannot convert base amount to target amount when both b and k are defined on an exponential curve. The math is too hard");
    } else {
      const R = amountAsNum(this.baseStorage.amount, this.baseMint)
      const S = supplyAsNum(this.targetMint);
      /*
       * dS = -S + ((S^(1 + k) (R + dR))/R)^(1/(1 + k))
       */
      return (-S + Math.pow(((Math.pow(S, 1 + this.k) * (R + dR)) / R), 1 / (1 + this.k))) * (1 - asDecimal(targetRoyaltiesPercent));
    }
  }
}
