import { Alert, Box, Button, Heading, usePrevious, VStack } from "@chakra-ui/react";
import { Input } from "./Input";
import { yupResolver } from "@hookform/resolvers/yup";
import { DataV2 } from "@metaplex-foundation/mpl-token-metadata";
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
import { route, routes } from "pages/routes";
import React, { useEffect } from "react";
import { useAsyncCallback } from "react-async-hook";
import { FormProvider, useForm } from "react-hook-form";
import * as yup from "yup";
import { FormControlWithError } from "./FormControlWithError";
import { Recipient } from "./Recipient";
import {
  IMetadataFormProps,
  TokenMetadataInputs,
} from "./TokenMetadataInputs";
import { MintSelect } from "./MintSelect";

interface IBountyFormProps extends IMetadataFormProps {
  mint: string;
  shortName: string;
  contact: string;
  discussion: string;
  authority: string;
}

const validationSchema = yup.object({
  mint: yup.string().required(),
  image: yup.mixed(),
  name: yup.string().required().min(2),
  description: yup.string(),
  shortName: yup.string().min(2).max(10),
  contact: yup.string(),
  discussion: yup.string(),
  authority: yup.string().required(),
});

async function createBounty(
  marketplaceSdk: MarketplaceSdk,
  values: IBountyFormProps
): Promise<PublicKey> {
  const mint = new PublicKey(values.mint);
  const authority = new PublicKey(values.authority);

  const targetMintKeypair = Keypair.generate();
  // const uri = await marketplaceSdk.tokenMetadataSdk.createArweaveMetadata({
  //   name: values.name,
  //   symbol: values.shortName,
  //   description: values.description,
  //   image: values.image?.name,
  //   files: [values.image].filter(truthy),
  //   mint: targetMintKeypair.publicKey,
  //   attributes: [
  //     {
  //       trait_type: "is_strata_bounty",
  //       display_type: "Strata Bounty",
  //       value: "true",
  //     },
  //     {
  //       trait_type: "bounty_uri",
  //       display_type: "Bount URI",
  //       value: `https://marketplace.strataprotocol.com/bounties/${mint}`,
  //     },
  //     {
  //       trait_type: "contact",
  //       display_type: "Contact",
  //       value: values.contact,
  //     },
  //     {
  //       trait_type: "discussion",
  //       display_type: "Discussion",
  //       value: values.discussion,
  //     },
  //   ],
  // });
  const uri =
    "https://strata-token-metadata.s3.us-east-2.amazonaws.com/test-bounty.json";
  const { tokenBonding } = await marketplaceSdk.createBounty({
    targetMintKeypair,
    authority,
    metadata: new DataV2({
      name: values.name,
      symbol: values.shortName,
      uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    }),
    baseMint: mint,
  });

  return tokenBonding;
}

export const BountyForm: React.FC = () => {
  const formProps = useForm<IBountyFormProps>({
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
  const { loading, error } = useAsyncCallback(createBounty);
  const { marketplaceSdk } = useMarketplaceSdk();
  const router = useRouter();
  const { authority, mint } = watch();
  const mintKey = usePublicKey(mint);
  const { info: mintTokenRef } = useMintTokenRef(mintKey);
  const prevAuthority = usePrevious(authority);

  // Social tokens should default bounties to the owner of the social token
  // as the authority. This is generally better because if the owner acts in 
  // bad faith, they'll collapse the value of their own token. Vs a fan who can
  // easily not give money to the creator
  useEffect(() => {
    if (!authority && mintTokenRef) {
      const owner = mintTokenRef.owner as PublicKey | undefined;
      if (owner) {
        setValue("authority", owner.toBase58());
      }
    }
  }, [mintTokenRef]);


  const onSubmit = async (values: IBountyFormProps) => {
    const tokenBondingKey = await createBounty(marketplaceSdk!, values);
    router.push(route(routes.bounty, { tokenBondingKey: tokenBondingKey.toBase58() }));
  };

  const authorityRegister = register("authority");

  return (
    <FormProvider {...formProps}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <VStack spacing={8}>
          <TokenMetadataInputs />
          <FormControlWithError
            id="shortName"
            help="A less than 10 character name for this bounty. This will be the bounty token's symbol."
            label="Short Name"
            errors={errors}
          >
            <Input {...register("shortName")} />
          </FormControlWithError>

          <FormControlWithError
            id="mint"
            help={`The mint that should be used to on this bounty, example ${NATIVE_MINT.toBase58()} for SOL`}
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
            help="The wallet that signs to disburse the funds of this bounty when it is completed. 
            For social tokens, this defaults to the wallet associated with the social token. This
            can also be an SPL Governance address or a multisig."
            label="Bounty Authority"
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
            id="contact"
            help="The contact information of the bounty authority. This can be an email address, twitter handle, etc."
            label="Authority Contact Information"
            errors={errors}
          >
            <Input {...register("contact")} />
          </FormControlWithError>
          <FormControlWithError
            id="discussion"
            help="A link to where this bounty is actively being discussed. This can be a github issue, forum link, etc. Use this to coordinate the bounty."
            label="Discussion"
            errors={errors}
          >
            <Input {...register("discussion")} />
          </FormControlWithError>

          {error && (
            <Alert status="error">
              <Alert status="error">{error.toString()}</Alert>
            </Alert>
          )}

          <Button
            type="submit"
            alignSelf="flex-end"
            colorScheme="orange"
            isLoading={isSubmitting || loading}
            loadingText={awaitingApproval ? "Awaiting Approval" : "Loading"}
          >
            Send Bounty
          </Button>
        </VStack>
      </form>
    </FormProvider>
  );
};