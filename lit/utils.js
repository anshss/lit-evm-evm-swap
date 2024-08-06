import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNetwork } from "@lit-protocol/constants";
import { ethers } from "ethers";
import { ipfsHelpers } from "ipfs-helpers";
import bs58 from "bs58";
import { swapErc20LitAction } from "./actions";
import { createERC20SwapLitAction } from "./swapActionGenerator";
import { pkpNftAddress, pkpNftAbi } from "../config/abi";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
    decode
} from "@lit-protocol/auth-helpers";
import { LIT_CHAINS } from "@lit-protocol/constants";
import {
    EthWalletProvider,
    LitAuthClient,
  } from "@lit-protocol/lit-auth-client";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

const privateKey1 = process.env.NEXT_PUBLIC_PRIVATE_KEY_1;
const privateKey2 = process.env.NEXT_PUBLIC_PRIVATE_KEY_2;

// swap params --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// chain conditions need chainName
// chain transactions need chainId
// transaction needs chain provider

// deposit1: wA deposits on cB, if action executes, funds are transferred to wB
// deposit1: wB deposits on cA, if action executes, funds are transferred to wA

const chainAParams = {
    from: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    to: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    tokenAddress: "0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A", // token contract
    chain: "baseSepolia",
    amount: "4",
    decimals: 18,
    provider: "https://sepolia.base.org",
};

const chainBParams = {
    from: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C",
    to: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB", // wallet A
    tokenAddress: "0x42539F21DFc25fD9c4f118a614e32169fc16D30a",
    // tokenAddress: "0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2",
    // chain: "sepolia",
    chain: "yellowstone",
    amount: "8",
    decimals: 18,
    provider: "https://ethereum-sepolia-rpc.publicnode.com",
};

// variables -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const LitActionCode_1 = `
const go = async () => {
    const abi = ["function balanceOf(address) view returns (uint256)"];

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        // LIT_CHAINS[chainAParams.chain].rpcUrls[0]
        params.rpc1
    );
    const contract_1 = new ethers.Contract(
        params.chainAParams.tokenAddress,
        abi,
        params.chainAProvider
    );
    const bal_1 = await contract_1.balanceOf(params.mintedPKP.ethAddress);
    const balanceInTokens_1 = ethers.utils.formatUnits(
        bal_1,
        params.chainAParams.decimals
    );
    // const format_requirement_1 = ethers.utils.formatUnits(params.chainAParams.amount, params.chainAParams.decimals);

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        // LIT_CHAINS[chainBParams.chain].rpcUrls[0]
        params.rpc2
    );
    const contract_2 = new ethers.Contract(
        params.chainBParams.tokenAddress,
        abi,
        params.chainBProvider
    );
    const bal_2 = await contract_2.balanceOf(params.mintedPKP.ethAddress);
    const balanceInTokens_2 = ethers.utils.formatUnits(
        bal_2,
        params.chainBParams.decimals
    );

    // const chainAConditionsPass = balanceInTokens_1 >= format_requirement_1

    console.log(balanceInTokens_1, balanceInTokens_2)

    if (balanceInTokens_1 > 0 && balanceInTokens_2 > 0) {
        let toSign = new TextEncoder().encode("Hello World");
        toSign = ethers.utils.arrayify(ethers.utils.keccak256(toSign));

        await Lit.Actions.signEcdsa({
            toSign: toSign,
            publicKey: params.mintedPKP.publicKey,
            sigName: "chainASignature",
        });
        console.log("signed")
    }
     LitActions.setResponse({
        response: "true",
    });
};
go();
`;

const LitActionCode_2 = `
const go = async () => {
    let toSign = new TextEncoder().encode('Hello World');
    toSign = ethers.utils.arrayify(ethers.utils.keccak256(toSign));

    const signature = await Lit.Actions.signEcdsa({
        toSign,
        publicKey,
        sigName: "signature",
    });

    Lit.Actions.setResponse({ response: JSON.stringify(signature) });
};
go()
`

const LitActionCode_3 = `
const go = async () => {
};
go()
`

let action_ipfs_1 = "QmcvSUP3yvPFyNWrbi9SeoK68VFEtRRnYAgmJ8Xbew33ji";
let action_ipfs_2 = "QmTGjA8GqAnjUpSdjMdJtibakSHA98UJVvopEsTZZdDpN5";

let mintedPKP_1 = {
    "tokenId": "85744674003930258782983045089233406135229559826710315912918358770646502918856",
    "publicKey": "0x04bf8af2397c558da658f693ade0d4cffb65cc4f6db9caaa63be25fd1f7947ab3d4bedc1848ab0da51763a4bd89b4c092812c7443c47480990aee2aaffd1d81744",
    "ethAddress": "0x9f5940573F19238112aF50BB692Df2C13dbe095E"
}

let mintedPKP_2 = {
    "tokenId": "50256068162962664245868300213784752568535485989617074952507855621103967828366",
    "publicKey": "0x04be4a531aca14c6d14ea6f1d3dc0a385af766c35dbaa71194392d71c31dbc82ff9bad60d7a80e7283ff8fe79c6919b5c500c626f665e6daba779f4de3b17b2360",
    "ethAddress": "0xb788F49C76c1De9419A6E2Be055bE2c0AFAF69d5"
}

let mintedPKP = mintedPKP_2;
let action_ipfs = action_ipfs_2;

let params = {
    rpc1: LIT_CHAINS[chainAParams.chain].rpcUrls[0],
    rpc2: LIT_CHAINS[chainBParams.chain].rpcUrls[0],
    chainAParams: chainAParams,
    chainBParams: chainBParams,
    mintedPKP: mintedPKP,
}

// const e = LIT_CHAINS[chainAParams.chain].rpcUrls[0];
// `https://yellowstone-rpc.litprotocol.com/`

// wallet getters --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function getWalletA() {
    // const provider = new ethers.providers.Web3Provider(window.ethereum);
    // const wallet = provider.getSigner();

    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(privateKey1, provider);
    return wallet;
}

async function getWalletB() {
    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(privateKey2, provider);
    return wallet;
}

// main functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function createLitAction() {
    const action = createERC20SwapLitAction(chainAParams, chainBParams);

    console.log("Lit Action code:\n", action);
}

export async function mintGrantBurnPKP() {
    console.log("mint/grant/burn started..");
    const signer = await getWalletA();

    const litContracts = new LitContracts({
        signer: signer,
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    // const ipfsCID = await uploadLitActionToIPFS(LitActionCode_1);
    const bytesCID = await stringToBytes(action_ipfs);
    // console.log(ipfsCID);

    const pkpNft = new ethers.Contract(pkpNftAddress, pkpNftAbi, signer);

    const mintCost = await pkpNft.mintCost();
    const mgbTxData = await pkpNft.populateTransaction.mintGrantAndBurnNext(
        2,
        bytesCID,
        { value: mintCost }
    );

    const feeData = await signer.getFeeData();
    mgbTxData.gasPrice = feeData.gasPrice;

    const gasLimit = await signer.estimateGas(mgbTxData);
    mgbTxData.gasLimit = gasLimit.mul(105).div(100);

    const txnWithGas = await signer.populateTransaction(mgbTxData);
    const serializedTxn = await signer.signTransaction(txnWithGas);

    const mgbTx = await signer.provider.sendTransaction(serializedTxn);

    const receipt = await mgbTx.wait();
    console.log("mint/grant/burn executed: ", receipt);

    const tokenId = ethers.BigNumber.from(receipt.logs[1].topics[3]).toString();
    const publicKey = await litContracts.pkpNftContract.read.getPubkey(tokenId);
    const ethAddress = ethers.utils.computeAddress(publicKey);

    const pkp = { tokenId, publicKey, ethAddress };
    // mintedPKP = pkp;
    console.log("PKP: ", pkp);
}

export async function checkPermits() {
    console.log("checking perms..");
    // const signerA = await getWalletA();

    const litContracts = new LitContracts({
        // signer: signerA,
        network: LitNetwork.DatilDev,
        debug: false,
    });
    await litContracts.connect();

    let permittedActions =
        await litContracts.pkpPermissionsContract.read.getPermittedActions(mintedPKP.tokenId);
    
    let checkGeneratedAction = stringToBytes(action_ipfs)

    let permittedAuthMethods =
        await litContracts.pkpPermissionsContract.read.getPermittedAuthMethods(mintedPKP.tokenId);
    let permittedAddresses =
        await litContracts.pkpPermissionsContract.read.getPermittedAddresses(mintedPKP.tokenId);

    console.log("Actions ", permittedActions, checkGeneratedAction);
    console.log("Auth methods ", permittedAuthMethods);
    console.log("Addresses ", permittedAddresses);
}

export async function depositOnChainA() {
    console.log(
        `deposit started from wallet A on chain A (${chainAParams.chain})..`
    );
    let wallet = await getWalletA();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainAProvider);

    // sometimes you may manually need to adjust gas limit
    const transactionObject = {
        to: chainAParams.tokenAddress,
        from: await wallet.getAddress(),
        gasPrice: await wallet.provider.getGasPrice(),
        gasLimit: ethers.BigNumber.from("200000"),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainAParams.amount, chainAParams.decimals)
                .toString()
        ),
    };

    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("deposit executed: ", receipt);
}

export async function depositOnChainB() {
    console.log(
        `deposit started from wallet B on chain B (${chainBParams.chain})..`
    );
    let wallet = await getWalletB();

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );
    wallet = wallet.connect(chainAProvider);

    // sometimes you may manually need to adjust gas limit
    const transactionObject = {
        to: chainBParams.tokenAddress,
        from: await wallet.getAddress(),
        gasPrice: await wallet.provider.getGasPrice(),
        gasLimit: ethers.BigNumber.from("200000"),
        data: generateCallData(
            mintedPKP.ethAddress,
            ethers.utils
                .parseUnits(chainBParams.amount, chainBParams.decimals)
                .toString()
        ),
    };

    const tx = await wallet.sendTransaction(transactionObject);
    const receipt = await tx.wait();

    console.log("deposit executed: ", receipt);
}

export async function getFundsStatus() {
    console.log("checking balances..");

    const abi = ["function balanceOf(address) view returns (uint256)"];

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainAParams.chain].rpcUrls[0]
    );
    const contract_1 = new ethers.Contract(
        chainAParams.tokenAddress,
        abi,
        chainAProvider
    );
    const bal_1 = await contract_1.balanceOf(mintedPKP.ethAddress);
    const balanceInTokens_1 = ethers.utils.formatUnits(
        bal_1,
        chainAParams.decimals
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[chainBParams.chain].rpcUrls[0]
    );
    const contract_2 = new ethers.Contract(
        chainBParams.tokenAddress,
        abi,
        chainBProvider
    );
    const bal_2 = await contract_2.balanceOf(mintedPKP.ethAddress);
    const balanceInTokens_2 = ethers.utils.formatUnits(
        bal_2,
        chainBParams.decimals
    );

    console.log("balance on chain A: ", balanceInTokens_1);
    console.log("balance on chain B: ", balanceInTokens_2);
}

export async function executeSwapAction() {
    console.log("executing action started..");
    const sessionSigs = await sessionSigUser();
    const signer = await getWalletA();

    const gasConfig = {
        maxFeePerGas: "100000000000", // in wei
        maxPriorityFeePerGas: "40000000000", // in wei
        gasLimit: "21000",
    };

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpAddress: mintedPKP.ethAddress,
            pkpPublicKey: mintedPKP.publicKey,
            chainAGasConfig: gasConfig,
            chainBGasConfig: gasConfig,
            authSig: JSON.stringify(
                await generateAuthSig({
                    signer: signer,
                    toSign: await createSiweMessageWithRecaps({
                        uri: "http://localhost",
                        expiration: new Date(
                            Date.now() + 1000 * 60 * 60 * 24
                        ).toISOString(), // 24 hours
                        walletAddress: await signer.getAddress(),
                        nonce: await litNodeClient.getLatestBlockhash(),
                        litNodeClient,
                    }),
                })
            ),
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);

    if (results.response == "Conditions for swap not met!") {
        return;
    }

    const signA = formatSignature(results.signatures.chainATransaction);
    const signB = formatSignature(results.signatures.chainASignature);

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        chainAParams.provider
    );

    const chainBProvider = new ethers.providers.JsonRpcProvider(
        chainBParams.provider
    );

    const tx1 = await chainAProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainATransaction,
            signA
        )
    );

    const tx2 = await chainBProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainBTransaction,
            signB
        )
    );

    console.log("swap tx1: ", tx1);
    console.log("swap tx2: ", tx2);
}


export async function executeTestAction() {
    console.log("executing action started..");
    const sessionSigs = await sessionSigLitAction();
    // const signer = await getWalletA();

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            publicKey: mintedPKP.publicKey,
            // params: params,
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);
}

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function uploadLitActionToIPFS(litActionCode) {
    const ipfsHash = await ipfsHelpers.stringToCidV0(litActionCode);

    console.log("ipfsHash: ", ipfsHash);

    return ipfsHash;
}

async function uploadViaPinata(_litActionCode) {
    const res = await fetch(
        "https://explorer.litprotocol.com/api/pinata/upload",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ _litActionCode }),
        }
    );
    const ipfsData = await res.json();
    console.log("ipfsData pinata:", ipfsData);
    return ipfsData;
}

async function stringToBytes(_string) {
    const LIT_ACTION_IPFS_CID_BYTES = `0x${Buffer.from(
        bs58.decode(_string)
    ).toString("hex")}`;

    return LIT_ACTION_IPFS_CID_BYTES;
}

export function BytesToString(_bytesString) {
    const decoded = bs58.encode(_bytesString);
    return decoded
  }

function formatSignature(signature) {
    const dataSigned = `0x${signature.dataSigned}`;

    const encodedSig = ethers.utils.joinSignature({
        v: signature.recid,
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
    });

    return encodedSig;
}

function generateCallData(counterParty, amount) {
    const transferInterface = new ethers.utils.Interface([
        "function transfer(address, uint256) returns (bool)",
    ]);
    return transferInterface.encodeFunctionData("transfer", [
        counterParty,
        amount,
    ]);
}

// session sigs --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function sessionSigLitAction() {
    console.log("creating session sig..")
    // const authWalletA = await getWalletA();

    await litNodeClient.connect();

    const pkpSessionSigsA = await litNodeClient.getLitActionSessionSigs({
        pkpPublicKey: mintedPKP.publicKey,
        resourceAbilityRequests: [
            {
                resource: new LitPKPResource("*"),
                ability: LitAbility.PKPSigning,
            },
            {
                resource: new LitActionResource("*"),
                ability: LitAbility.LitActionExecution,
            },
        ],
        litActionIpfsId: action_ipfs,
        jsParams: {
            publicKey: mintedPKP.publicKey,
            // params: params,
        },
    });

    console.log("sessionSigs: ", pkpSessionSigsA);
    return pkpSessionSigsA;
}

export async function sessionSigUser() {
    console.log("creating session sigs..");
    const ethersSigner = await getWalletA();

    await litNodeClient.connect();

    const sessionSigs = await litNodeClient.getSessionSigs({
        publicKey: mintedPKP.publicKey,
        chain: "ethereum",
        resourceAbilityRequests: [
            {
                resource: new LitActionResource("*"),
                ability: LitAbility.LitActionExecution,
            },
        ],
        authNeededCallback: async ({ resourceAbilityRequests }) => {
            const toSign = await createSiweMessageWithRecaps({
                uri: "http://localhost:3000",
                expiration: new Date(
                    Date.now() + 1000 * 60 * 60 * 24
                ).toISOString(), // 24 hours,
                resources: resourceAbilityRequests,
                walletAddress: await ethersSigner.getAddress(),
                nonce: await litNodeClient.getLatestBlockhash(),
                litNodeClient,
            });

            return await generateAuthSig({
                signer: ethersSigner,
                toSign,
            });
        },
    });

    console.log("sessionSigs: ", sessionSigs);
    return sessionSigs;
}

export async function sessionSigPkp() {
    console.log("creating session sigs..");
    const ethersSigner = await getWalletA();

    await litNodeClient.connect();

    const authMethod = await EthWalletProvider.authenticate({
        signer: ethersSigner,
        litNodeClient,
      });

    const sessionSigs = await litNodeClient.getPkpSessionSigs({
        pkpPublicKey: mintedPKP.publicKey,
        // authMethods: [authMethod],
        resourceAbilityRequests: [
            {
                resource: new LitPKPResource("*"),
                ability: LitAbility.PKPSigning,
            },
        ],
        expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    });

    console.log("sessionSigs: ", sessionSigs);
    return sessionSigs;
}