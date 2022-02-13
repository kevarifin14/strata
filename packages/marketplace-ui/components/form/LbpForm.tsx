import { Alert, Button, Input, VStack } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import { BN } from "@project-serum/anchor";
import { NATIVE_MINT } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { MarketplaceSdk } from "@strata-foundation/marketplace-sdk";
import {
  truthy,
  useMintTokenRef,
  usePrimaryClaimedTokenRef,
  useProvider,
  usePublicKey,
} from "@strata-foundation/react";
import { useMarketplaceSdk } from "contexts/marketplaceSdkContext";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { useAsyncCallback } from "react-async-hook";
import { FormProvider, useForm } from "react-hook-form";
import { route, routes } from "utils/routes";
import * as yup from "yup";
import { FormControlWithError } from "./FormControlWithError";
import { MintSelect } from "./MintSelect";
import { Recipient } from "./Recipient";
import { IMetadataFormProps, TokenMetadataInputs } from "./TokenMetadataInputs";

interface ILbpFormProps extends IMetadataFormProps {
  mint: string;
  symbol: string;
  authority: string;
  c: number;
  k0: number;
  k1: number;
  decimals: number;
  interval: number;
  mintCap: number;
}

const validationSchema = yup.object({
  mint: yup.string().required(),
  image: yup.mixed(),
  name: yup.string().required().min(2),
  description: yup.string(),
  symbol: yup.string().min(2).max(10),
  authority: yup.string().required(),
  k0: yup.number().min(0).required(),
  k1: yup.number().min(0).required(),
  interval: yup.number().min(0).required(),
  decimals: yup.number().min(0).required(),
  mintCap: yup.number().min(1).required(),
});

async function createLbp(
  marketplaceSdk: MarketplaceSdk,
  values: ILbpFormProps
): Promise<PublicKey> {
  const targetMintKeypair = Keypair.generate();
  const authority = new PublicKey(values.authority);
  const mint = new PublicKey(values.mint);

  // const uri = await marketplaceSdk.tokenMetadataSdk.createArweaveMetadata({
  //   name: values.name,
  //   symbol: values.symbol,
  //   description: values.description,
  //   image: values.image?.name,
  //   files: [values.image].filter(truthy),
  //   mint: targetMintKeypair.publicKey,
  // });

  const uri =
    "https://strata-token-metadata.s3.us-east-2.amazonaws.com/unclaimed.json";

  const { targetMint } = await marketplaceSdk.createLbp({
    targetMintKeypair,
    authority,
    metadata: new DataV2({
      // Max name len 32
      name: values.name.substring(0, 32),
      symbol: values.symbol.substring(0, 10),
      uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    }),
    baseMint: mint,
    c: Number(values.c),
    k0: Number(values.k0),
    k1: Number(values.k1),
    interval: Number(values.interval),
    bondingArgs: {
      targetMintDecimals: Number(values.decimals),
      mintCap: new BN(values.mintCap * Math.pow(10, values.decimals)),
    }
  });

  return targetMint;
}


export const LbpForm: React.FC = () => {
  const formProps = useForm<ILbpFormProps>({
    resolver: yupResolver(validationSchema),
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = formProps;
  const { publicKey } = useWallet();
  const { info: tokenRef } = usePrimaryClaimedTokenRef(publicKey);
  const { awaitingApproval } = useProvider();
  const { execute, loading, error } = useAsyncCallback(createLbp);
  const { marketplaceSdk } = useMarketplaceSdk();
  const router = useRouter();
  const { authority, mint } = watch();
  const mintKey = usePublicKey(mint);
  const { info: mintTokenRef } = useMintTokenRef(mintKey);

  const onSubmit = async (values: ILbpFormProps) => {
    const mintKey = await execute(marketplaceSdk!, values);
    router.push(route(routes.lbp, { mintKey: mintKey.toBase58() }));
  };

  const authorityRegister = register("authority");

  return (
    <FormProvider {...formProps}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <VStack spacing={8}>
          <TokenMetadataInputs />
          <FormControlWithError
            id="symbol"
            help="A less than 10 character symbol for the token being sold"
            label="Symbol"
            errors={errors}
          >
            <Input {...register("symbol")} />
          </FormControlWithError>

          <FormControlWithError
            id="mint"
            help={`The mint that should be used to buy this token, example ${NATIVE_MINT.toBase58()} for SOL`}
            label="Mint"
            errors={errors}
          >
            {tokenRef && (
              <Button
                variant="link"
                onClick={() => setValue("mint", tokenRef.mint.toBase58())}
              >
                Use my Social Token
              </Button>
            )}
            <MintSelect
              value={watch("mint")}
              onChange={(s) => setValue("mint", s)}
            />
          </FormControlWithError>

          <FormControlWithError
            id="authority"
            help="The wallet that receives the bootstrapped liquidity"
            label="Approver"
            errors={errors}
          >
            {publicKey && (
              <Button
                variant="link"
                onClick={() => setValue("authority", publicKey.toBase58())}
              >
                Set to My Wallet
              </Button>
            )}
            <Recipient
              name={authorityRegister.name}
              value={authority}
              onChange={authorityRegister.onChange}
            />
          </FormControlWithError>
          <FormControlWithError
            id="decimals"
            help="The number of decimals on this mint"
            label="Mint Decimals"
            errors={errors}
          >
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("decimals")}
            />
          </FormControlWithError>
          <FormControlWithError id="c" help="" label="C" errors={errors}>
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("c")}
            />
          </FormControlWithError>
          <FormControlWithError id="k0" help="" label="K0" errors={errors}>
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("k0")}
            />
          </FormControlWithError>
          <FormControlWithError id="k1" help="" label="K1" errors={errors}>
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("k1")}
            />
          </FormControlWithError>
          <FormControlWithError
            id="interval"
            help="The time in seconds that it will take to go from k0 to k1"
            label="Interval"
            errors={errors}
          >
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("interval")}
            />
          </FormControlWithError>
          <FormControlWithError
            id="mintCap"
            help="The maximum number of tokens that may be minted"
            label="Mint Cap"
            errors={errors}
          >
            <Input
              type="number"
              min={0}
              step={0.000000000001}
              {...register("mintCap")}
            />
          </FormControlWithError>

          {error && <Alert status="error">{error.toString()}</Alert>}

          <Button
            type="submit"
            alignSelf="flex-end"
            colorScheme="orange"
            isLoading={isSubmitting || loading}
            loadingText={awaitingApproval ? "Awaiting Approval" : "Loading"}
          >
            Create Lbp
          </Button>
        </VStack>
      </form>
    </FormProvider>
  );
};