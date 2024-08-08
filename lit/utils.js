import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNetwork } from "@lit-protocol/constants";
import { ethers } from "ethers";
import bs58 from "bs58";
import { pkpNftAddress, pkpNftAbi } from "../config/abi";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: true,
});

// variables -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const privateKey1 = process.env.NEXT_PUBLIC_PRIVATE_KEY_1;

const litActionCode = `
const go = async () => {
    let toSign = new TextEncoder().encode('Hello World');
    toSign = ethers.utils.arrayify(ethers.utils.keccak256(toSign));

    const signature = await Lit.Actions.signEcdsa({
        toSign,
        publicKey,
        sigName: "signature",
    });

    Lit.Actions.setResponse({ response: 1 });
};
go()
`;

let action_ipfs = "QmYSrjvQy5xgVCRvGFa6ipE53sXYSYYvB7zCFisA23s2kP";

let mintedPKP = {
    "tokenId": "77989347424838403760113109910327182864395527966198950968157889569025119064504",
    "publicKey": "0x04b353f9f6b9f126c969ea60314f26a36ed61fdaed8e59e393e2a7e39c9726e42aa96e53477b47dc68397760eae64fca5bab76d2bbf4978c41c2806ec2bfcce966",
    "ethAddress": "0x87B31cCC0aa10604320caDbab616b65C009112Ab"
}

// main functions -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function mintGrantBurnPKP() {
    console.log("mint/grant/burn started..");
    const signer = await getWalletA();

    const litContracts = new LitContracts({
        signer: signer,
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    // const ipfsCID = await uploadLitActionToIPFS(litActionCode);
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

    const litContracts = new LitContracts({
        network: LitNetwork.DatilDev,
        debug: false,
    });
    await litContracts.connect();

    let permittedActions =
        await litContracts.pkpPermissionsContract.read.getPermittedActions(
            mintedPKP.tokenId
        );

    let checkGeneratedAction = stringToBytes(action_ipfs);

    let permittedAuthMethods =
        await litContracts.pkpPermissionsContract.read.getPermittedAuthMethods(
            mintedPKP.tokenId
        );
    let permittedAddresses =
        await litContracts.pkpPermissionsContract.read.getPermittedAddresses(
            mintedPKP.tokenId
        );

    console.log("Actions ", permittedActions, checkGeneratedAction);
    console.log("Auth methods ", permittedAuthMethods);
    console.log("Addresses ", permittedAddresses);
}

export async function executeTestAction() {
    console.log("executing action started..");
    const sessionSigs = await sessionSigLitAction();

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: action_ipfs,
        sessionSigs: sessionSigs,
        jsParams: {
            publicKey: mintedPKP.publicKey,
        },
    });

    console.log("logs: ", results.logs);
    console.log("results: ", results);
    console.log("signatures: ", results.signatures);
}

// helper functions ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function stringToBytes(_string) {
    const LIT_ACTION_IPFS_CID_BYTES = `0x${Buffer.from(
        bs58.decode(_string)
    ).toString("hex")}`;

    return LIT_ACTION_IPFS_CID_BYTES;
}

export function BytesToString(_bytesString) {
    const decoded = bs58.encode(_bytesString);
    return decoded;
}

async function getWalletA() {
    const provider = new ethers.providers.JsonRpcProvider(
        `https://yellowstone-rpc.litprotocol.com/`
    );
    const wallet = new ethers.Wallet(privateKey1, provider);
    return wallet;
}

// session sigs --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function sessionSigLitAction() {
    console.log("creating session sig..");

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
