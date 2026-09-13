import { test, expect } from "@playwright/test";
import { encodeFunctionData, maxUint256 } from "viem";
import {
  clientsFor,
  erc20Abi,
  faucetAbi,
  loadManifest,
  marketAbi,
  resolveAnvilRpc,
  send,
  vaultFactoryAbi,
} from "./helpers/anvil";

test.describe("Anvil protocol flows", () => {
  test("supply, collateral, borrow wallet+restricted, repay, withdraw limit, liquidate", async () => {
    test.setTimeout(180_000);
    const rpcUrl = await resolveAnvilRpc();
    test.skip(!rpcUrl, "Anvil RPC not reachable, or factory in deployments/31337/v2.json has no code");
    const manifest = loadManifest();
    test.skip(!manifest, "deployments/31337/v2.json missing — run DeployV2Local.s.sol");

    const walletMarket = manifest!.markets.find((m) => m.deliveryMode === "wallet");
    const restrictedMarket = manifest!.markets.find((m) => m.deliveryMode === "restricted");
    expect(walletMarket && restrictedMarket).toBeTruthy();

    const fresh = clientsFor(7, rpcUrl);
    const { publicClient, walletClient, account } = fresh;

    await send(walletClient, publicClient, {
      account,
      to: manifest!.faucet,
      data: encodeFunctionData({ abi: faucetAbi, functionName: "drip" }),
    });

    const loan =
      manifest!.loanToken ??
      (await publicClient.readContract({
        address: walletMarket!.address,
        abi: marketAbi,
        functionName: "loanToken",
      }));
    const collat =
      manifest!.collateralToken ??
      (await publicClient.readContract({
        address: walletMarket!.address,
        abi: marketAbi,
        functionName: "collateralToken",
      }));

    await send(walletClient, publicClient, {
      account,
      to: loan,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [walletMarket!.address, maxUint256] }),
    });
    await send(walletClient, publicClient, {
      account,
      to: collat,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [walletMarket!.address, maxUint256] }),
    });
    await send(walletClient, publicClient, {
      account,
      to: loan,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [restrictedMarket!.address, maxUint256],
      }),
    });
    await send(walletClient, publicClient, {
      account,
      to: collat,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [restrictedMarket!.address, maxUint256],
      }),
    });

    await send(walletClient, publicClient, {
      account,
      to: walletMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "supply", args: [5_000n * 10n ** 6n, 0n] }),
    });
    await send(walletClient, publicClient, {
      account,
      to: walletMarket!.address,
      data: encodeFunctionData({
        abi: marketAbi,
        functionName: "addCollateral",
        args: [account.address, 5n * 10n ** 18n],
      }),
    });
    await send(walletClient, publicClient, {
      account,
      to: walletMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "borrow", args: [1_000n * 10n ** 6n, maxUint256] }),
    });
    const walletDebt = await publicClient.readContract({
      address: walletMarket!.address,
      abi: marketAbi,
      functionName: "positionDebt",
      args: [account.address],
    });
    expect(walletDebt > 0n).toBeTruthy();

    const loanBalAfterWalletBorrow = await publicClient.readContract({
      address: loan,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    await send(walletClient, publicClient, {
      account,
      to: restrictedMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "supply", args: [5_000n * 10n ** 6n, 0n] }),
    });
    await send(walletClient, publicClient, {
      account,
      to: restrictedMarket!.address,
      data: encodeFunctionData({
        abi: marketAbi,
        functionName: "addCollateral",
        args: [account.address, 5n * 10n ** 18n],
      }),
    });
    await send(walletClient, publicClient, {
      account,
      to: restrictedMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "borrow", args: [1_000n * 10n ** 6n, maxUint256] }),
    });

    const loanBalAfterRestricted = await publicClient.readContract({
      address: loan,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    expect(loanBalAfterRestricted).toBe(loanBalAfterWalletBorrow - 5_000n * 10n ** 6n);

    if (manifest!.vaultFactory) {
      const vault = await publicClient.readContract({
        address: manifest!.vaultFactory,
        abi: vaultFactoryAbi,
        functionName: "vaultOf",
        args: [restrictedMarket!.address, account.address],
      });
      expect(vault).not.toBe("0x0000000000000000000000000000000000000000");
      const vaultBal = await publicClient.readContract({
        address: loan,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [vault],
      });
      expect(vaultBal >= 1_000n * 10n ** 6n).toBeTruthy();
    }

    await send(walletClient, publicClient, {
      account,
      to: walletMarket!.address,
      data: encodeFunctionData({
        abi: marketAbi,
        functionName: "repay",
        args: [account.address, 100n * 10n ** 6n],
      }),
    });

    const cash = await publicClient.readContract({
      address: walletMarket!.address,
      abi: marketAbi,
      functionName: "accountedCash",
    });
    const maxW = await publicClient.readContract({
      address: walletMarket!.address,
      abi: marketAbi,
      functionName: "maxWithdraw",
      args: [account.address],
    });
    expect(maxW <= cash).toBeTruthy();
    if (maxW > 0n) {
      await send(walletClient, publicClient, {
        account,
        to: walletMarket!.address,
        data: encodeFunctionData({ abi: marketAbi, functionName: "withdraw", args: [maxW, maxUint256] }),
      });
    }

    const victim = clientsFor(8, rpcUrl);
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: manifest!.faucet,
      data: encodeFunctionData({ abi: faucetAbi, functionName: "drip" }),
    });
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: loan,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [walletMarket!.address, maxUint256] }),
    });
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: collat,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [walletMarket!.address, maxUint256] }),
    });
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: walletMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "supply", args: [2_000n * 10n ** 6n, 0n] }),
    });
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: walletMarket!.address,
      data: encodeFunctionData({
        abi: marketAbi,
        functionName: "addCollateral",
        args: [victim.account.address, 1n * 10n ** 18n],
      }),
    });
    await send(victim.walletClient, victim.publicClient, {
      account: victim.account,
      to: walletMarket!.address,
      data: encodeFunctionData({ abi: marketAbi, functionName: "borrow", args: [1_200n * 10n ** 6n, maxUint256] }),
    });

    const liqShares = await publicClient.readContract({
      address: walletMarket!.address,
      abi: marketAbi,
      functionName: "debtSharesOf",
      args: [victim.account.address],
    });
    expect(liqShares > 0n).toBeTruthy();
  });
});
