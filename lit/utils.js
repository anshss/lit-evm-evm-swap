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
    LitPKPResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
} from "@lit-protocol/auth-helpers";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

const privateKey = process.env.REACT_APP_PRIVATE_KEY;

let litAction = "";
let mintedPKP = {
    "tokenId": "30135224405781956285684880943225910122322382327008791932755411033665437984404",
    "publicKey": "0x04a01531f53d8880d6a41f9502c1ea2145c32c3c2cae6d11bde401e6fc99a69253023f94a0cd01bbec04db7f95f46f8726c953d012e2e0277357d4dd91b57dd804",
    "ethAddress": "0xEaeac8fE39aBa710409B9aA6574e0B292665Abee"
}

// main functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function createLitAction() {
    const chainAParams = {
        counterPartyAddress: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB", // Wallet address to send ERC20 tokens on Chain A
        tokenAddress: "0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A",
        chain: "baseSepolia",
        amount: "4", 
        decimals: 18, 
    };
    const chainBParams = {
        counterPartyAddress: "0x291B0E3aA139b2bC9Ebd92168575b5c6bAD5236C", // Wallet address to send ERC20 tokens on Chain B
        tokenAddress: "0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2",
        chain: "sepolia",
        amount: "8", 
        decimals: 18,
    };

    const action = createERC20SwapLitAction(chainAParams, chainBParams);
    litAction = action;

    console.log("Lit Action code: ", action);
}

export async function mintGrantBurnPKP() {
    console.log("mint/grant/burn started..");
    const signer = await getWallet();

    const litContracts = new LitContracts({
        signer: signer,
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    // const ipfsCID = "Qmf4z2SmUSmy4FyJXeYE3KpA49yyU9JAb1D315h3ovFdy4" // pinned action
    const ipfsCID = await uploadLitActionToIPFS(swapErc20LitAction);
    const bytesCID = await stringToBytes(ipfsCID);
    console.log(ipfsCID);

    const pkpNft = new ethers.Contract(pkpNftAddress, pkpNftAbi, signer);

    const mintCost = await pkpNft.mintCost();
    const mgbTxData = await pkpNft.populateTransaction.mintGrantAndBurnNext(
        2,
        bytesCID,
        { value: mintCost }
    );

    const gasLimit = await signer.estimateGas(mgbTxData);
    const feeData = await signer.getFeeData();

    mgbTxData.gasLimit = gasLimit.mul(105).div(100);
    mgbTxData.gasPrice = feeData.gasPrice;

    const txnWithGas = await signer.populateTransaction(mgbTxData);
    const serializedTxn = await signer.signTransaction(txnWithGas);

    const mgbTx = await signer.provider.sendTransaction(serializedTxn);

    const receipt = await mgbTx.wait();
    console.log("mint/grant/burn executed: ", receipt);

    const tokenId = ethers.BigNumber.from(receipt.logs[1].topics[3]).toString();
    const publicKey = await litContracts.pkpNftContract.read.getPubkey(tokenId);
    const ethAddress = ethers.utils.computeAddress(publicKey);

    const pkp = { tokenId, publicKey, ethAddress };
    mintedPKP = pkp;
    console.log("PKP: ", pkp);
}

export async function executeAction() {
    console.log("executing action started..");
    const sessionSigs = await sigA();
    
    await litNodeClient.connect();
    
    const gasConfig = {
        maxFeePerGas: "100000000000", // in wei
        maxPriorityFeePerGas: "40000000000", // in wei
        gasLimit: "21000",
    };
    const ethersSignerA = await getWallet();
    
    const results = await litNodeClient.executeJs({
        code: swapErc20LitAction,
        sessionSigs: sessionSigs,
        jsParams: {
            pkpAddress: mintedPKP.ethAddress,
            chainAGasConfig: gasConfig,
            chainBGasConfig: gasConfig,
            authSig: JSON.stringify(
                await generateAuthSig({
                    signer: ethersSignerA,
                    toSign: await createSiweMessageWithRecaps({
                        uri: "http://localhost",
                        expiration: new Date(
                            Date.now() + 1000 * 60 * 60 * 24
                        ).toISOString(), // 24 hours
                        walletAddress: await ethersSignerA.getAddress(),
                        nonce: await litNodeClient.getLatestBlockhash(),
                        litNodeClient,
                    }),
                })
            ),
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);

    const chainAProvider = new ethers.providers.JsonRpcProvider(
        `https://sepolia.base.org`
    );
    const chainBProvider = new ethers.providers.JsonRpcProvider(
        `https://mainnet.infura.io/v3/`
    );

    await chainAProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainATransaction,
            results.signatures.chainASignature
        )
    );

    await chainBProvider.sendTransaction(
        ethers.utils.serializeTransaction(
            results.response.chainBTransaction,
            results.signatures.chainBSignature
        )
    );
}

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function getWallet() {
    // const provider = new ethers.providers.Web3Provider(window.ethereum);
    // const signer = provider.getSigner();
    const provider = new ethers.providers.JsonRpcProvider(
        "https://yellowstone-rpc.litprotocol.com/"
    );
    const signer = new ethers.Wallet(
        privateKey,
        provider
    );
    return signer;
}

async function uploadLitActionToIPFS(litActionCode) {
    const ipfsHash = await ipfsHelpers.stringToCidV0(litActionCode);

    console.log("ipfsHash: ", ipfsHash);

    return ipfsHash;
}

async function stringToBytes(_string) {
    const LIT_ACTION_IPFS_CID_BYTES = `0x${Buffer.from(
        bs58.decode(_string)
    ).toString("hex")}`;

    return LIT_ACTION_IPFS_CID_BYTES;
}

async function sigA() {
    // const provider = new ethers.providers.Web3Provider(window.ethereum);
    // const ethersSignerA = provider.getSigner()
    // console.log("creating session sigs..", mintedPKP.ethAddress);
    const ethersSignerA = await getWallet();

    const gasConfig = {
        maxFeePerGas: "100000000000", // in wei
        maxPriorityFeePerGas: "40000000000", // in wei
        gasLimit: "21000",
    };

    await litNodeClient.connect();

    const sessionSig = await litNodeClient.getLitActionSessionSigs({
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
        litActionCode: Buffer.from(swapErc20LitAction).toString("base64"),
        jsParams: {
            pkpAddress: mintedPKP.ethAddress,
            chainAGasConfig: gasConfig,
            chainBGasConfig: gasConfig,
            authSig: JSON.stringify(
                await generateAuthSig({
                    signer: ethersSignerA,
                    toSign: await createSiweMessageWithRecaps({
                        uri: "http://localhost",
                        expiration: new Date(
                            Date.now() + 1000 * 60 * 60 * 24
                        ).toISOString(), // 24 hours
                        walletAddress: await ethersSignerA.getAddress(),
                        nonce: await litNodeClient.getLatestBlockhash(),
                        litNodeClient,
                    }),
                })
            ),
        },
    });

    console.log("sessionSigs: ", sessionSig);
    return sessionSig;
}

// export async function sigC() {
//     console.log("creating session sigs..");
//     // const provider = new ethers.providers.Web3Provider(window.ethereum);
//     // const ethersSigner = provider.getSigner();
//     const ethersSigner = await getWallet();

//     await litNodeClient.connect();

//     const sessionSigs = await litNodeClient.getSessionSigs({
//         chain: "ethereum",
//         resourceAbilityRequests: [
//             {
//                 resource: new LitActionResource("*"),
//                 ability: LitAbility.LitActionExecution,
//             },
//         ],
//         authNeededCallback: async ({ resourceAbilityRequests }) => {
//             const toSign = await createSiweMessageWithRecaps({
//                 uri: "http://localhost:3000",
//                 expiration: new Date(
//                     Date.now() + 1000 * 60 * 60 * 24
//                 ).toISOString(), // 24 hours,
//                 resources: resourceAbilityRequests,
//                 walletAddress: await ethersSigner.getAddress(),
//                 nonce: await litNodeClient.getLatestBlockhash(),
//                 litNodeClient,
//             });

//             return await generateAuthSig({
//                 signer: ethersSigner,
//                 toSign,
//             });
//         },
//     });

//     console.log("sessionSigs: ", sessionSigs);
//     return sessionSigs;
// }