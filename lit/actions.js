export const swapErc20LitAction = `
const go = async () => {
      
    const originTime = undefined ? undefined : Date.now();
    const chainACondition = {"conditionType":"evmBasic","contractAddress":"0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A","standardContractType":"ERC20","chain":"baseSepolia","method":"balanceOf","parameters":["address"],"returnValueTest":{"comparator":">=","value":"4000000000000000000"}}
    const chainBCondition = {"conditionType":"evmBasic","contractAddress":"0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2","standardContractType":"ERC20","chain":"sepolia","method":"balanceOf","parameters":["address"],"returnValueTest":{"comparator":">=","value":"8000000000000000000"}}
    let chainATransaction = {"to":"0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A","nonce":0,"chainId":"baseSepolia","gasLimit":"50000","from":"{{pkpPublicKey}}","data":"0xa9059cbb000000000000000000000000291b0e3aa139b2bc9ebd92168575b5c6bad5236c0000000000000000000000000000000000000000000000003782dace9d900000","type":2}
    let chainBTransaction = {"to":"0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2","nonce":0,"chainId":"sepolia","gasLimit":"50000","from":"{{pkpPublicKey}}","data":"0xa9059cbb00000000000000000000000048e6a467852fa29710aaacdb275f85db4fa420eb0000000000000000000000000000000000000000000000006f05b59d3b200000","type":2}
    let chainAClawbackTransaction = {"to":"0x7ce2a725e3644D49009c1890dcdBebA8e5D43d4A","nonce":0,"chainId":"baseSepolia","gasLimit":"50000","from":"{{pkpPublicKey}}","data":"0xa9059cbb00000000000000000000000048e6a467852fa29710aaacdb275f85db4fa420eb0000000000000000000000000000000000000000000000003782dace9d900000","type":2}
    let chainBClawbackTransaction = {"to":"0x31544EC35067c36F53ed3f5a9De1832E890Ad3c2","nonce":0,"chainId":"sepolia","gasLimit":"50000","from":"{{pkpPublicKey}}","data":"0xa9059cbb000000000000000000000000291b0e3aa139b2bc9ebd92168575b5c6bad5236c0000000000000000000000000000000000000000000000006f05b59d3b200000","type":2}

    const hashTransaction = (tx) => {
      return ethers.utils.arrayify(
        ethers.utils.keccak256(
          ethers.utils.arrayify(ethers.utils.serializeTransaction(tx)),
        ),
      );
    }

    function checkHasThreeDaysPassed(previousTime) {
        const currentTime = Date.now();
        const difference = currentTime - previousTime;
        return difference / (1000 * 3600 * 24) >= 3 ? true : false;
    }

    const generateSwapTransactions = async () => {
      await LitActions.signEcdsa({
        toSign: hashTransaction(chainATransaction),
        publicKey: pkpPublicKey,
        sigName: "chainASignature",
      });
      await LitActions.signEcdsa({
        toSign: hashTransaction(chainBTransaction),
        publicKey: pkpPublicKey,
        sigName: "chainBSignature",
      });
      Lit.Actions.setResponse({
        response: JSON.stringify({ chainATransaction, chainBTransaction }),
      });
    };
    
    chainACondition.parameters = chainBCondition.parameters = [
      pkpAddress,
    ];
    chainATransaction.from = chainBTransaction.from = pkpAddress;

    chainATransaction = {...chainATransaction, ...chainAGasConfig}
    chainBTransaction = {...chainBTransaction, ...chainBGasConfig}
    chainAClawbackTransaction = {...chainAClawbackTransaction, ...chainAGasConfig}
    chainBClawbackTransaction = {...chainBClawbackTransaction, ...chainBGasConfig}
    
    const chainAConditionsPass = await Lit.Actions.checkConditions({
      conditions: [chainACondition],
      // authSig,
      authSig: JSON.parse(authSig),
      chain: chainACondition.chain,
    });
  
    const chainBConditionsPass = await Lit.Actions.checkConditions({
      conditions: [chainBCondition],
      authSig: JSON.parse(authSig),
      chain: chainBCondition.chain,
    });
  
    if (chainAConditionsPass && chainBConditionsPass) {
      await generateSwapTransactions();
      return;
    }
  
    const threeDaysHasPassed = checkHasThreeDaysPassed(originTime);
    const chainANonce = await Lit.Actions.getLatestNonce({address: pkpAddress, chain: chainACondition.chain});
    const chainBNonce = await Lit.Actions.getLatestNonce({address: pkpAddress, chain: chainBCondition.chain});

    if (chainAConditionsPass) {
      if (chainBNonce === "0x1") {
        await generateSwapTransactions();
        return;
      }
      if (!threeDaysHasPassed) {
        Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
        return;
      }
      await Lit.Actions.signEcdsa({
        toSign: hashTransaction(chainAClawbackTransaction),
        publicKey: pkpPublicKey,
        sigName: "chainASignature",
      });
      Lit.Actions.setResponse({
        response: JSON.stringify({
          chainATransaction: chainAClawbackTransaction,
        }),
      });
      return;
    }
  
    if (chainBConditionsPass) {
      if (chainANonce === "0x1") {
        await generateSwapTransactions();
        return;
      }
      if (!threeDaysHasPassed) {
        Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
        return;
      }
      await Lit.Actions.signEcdsa({
        toSign: hashTransaction(chainBClawbackTransaction),
        publicKey: pkpPublicKey,
        sigName: "chainBSignature",
      });
      Lit.Actions.setResponse({
        response: JSON.stringify({
          chainBTransaction: chainBClawbackTransaction,
        }),
      });
      return;
    }
    Lit.Actions.setResponse({ response: "Conditions for swap not met!" });
  }
go();
`;
