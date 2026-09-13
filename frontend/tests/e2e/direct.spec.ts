import { test, expect } from "@playwright/test";
import { encodeFunctionData, parseAbi, parseEventLogs } from "viem";
import {
  clientsFor,
  erc20Abi,
  faucetAbi,
  loadManifest,
  resolveAnvilRpc,
  send,
} from "./helpers/anvil";

const nav = { waitUntil: "domcontentloaded" as const };

const factoryAbi = parseAbi([
  "function createFacility((address lender,address borrower,address loanToken,uint256 creditLimit,uint256 aprRay,uint32 acceptanceLifetime,uint32 borrowPeriod,uint32 recallWindow,address venue,address swapRouter,address otherToken) terms) returns (address facility)",
  "event FacilityCreated(address indexed facility, address indexed lender, address indexed borrower, address vault, bytes32 termsHash, address creator)",
]);

const facilityAbi = parseAbi([
  "function acceptTerms(bytes32 hash)",
  "function termsHash() view returns (bytes32)",
  "function fund(uint256 assets)",
  "function addCollateral(uint256 amount)",
  "function borrow(uint256 assets, uint256 maxDebtAfter, uint256 deadline)",
  "function vault() view returns (address)",
]);

test.describe("DL public surfaces without a wallet", () => {
  test("DL-01 public /direct does not require connect", async ({ page }) => {
    const res = await page.goto("/direct", nav);
    expect(res?.status() ?? 500, "GET /direct").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
    await expect(page.getByRole("heading", { name: "DIRECT LENDING" })).toBeVisible();
  });

  test("DL-02 header lists Direct lending with Markets weight", async ({ page }) => {
    await page.goto("/markets", nav);
    await expect(page.getByRole("navigation", { name: "Application" }).getByText("Direct lending")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Application" }).getByText("LENDER")).toHaveCount(0);
  });

  test("DL-03 empty-state CTAs stay on Direct", async ({ page }) => {
    await page.goto("/direct", nav);
    const offer = page.getByRole("link", { name: /Offer a credit line/i });
    if (await offer.count()) {
      await offer.click();
      await expect(page).toHaveURL(/\/direct\/new/);
    }
  });

  test("DL-04 five-step wizard is public until submit", async ({ page }) => {
    const res = await page.goto("/direct/new", nav);
    expect(res?.status() ?? 500).toBeLessThan(400);
    await expect(page.getByText("CREATE AGREEMENT")).toBeVisible();
    await expect(page.getByText("Intent")).toBeVisible();
    await page.getByRole("button", { name: /Borrow from someone/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Lender's wallet address|Borrower's wallet address/i)).toBeVisible();
  });

  test("DL-05 explore directory is public", async ({ page }) => {
    const res = await page.goto("/direct/explore", nav);
    expect(res?.status() ?? 500).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("DL-06 desk has Pool and Direct tabs", async ({ page }) => {
    await page.goto("/desk", nav);
    await expect(page.getByRole("link", { name: /Pool loans/i })).toBeVisible();
    await page.getByRole("link", { name: /Direct agreements/i }).click();
    await expect(page).toHaveURL(/product=direct/);
  });

  test("DL-07 dashboard disconnected still has no global role badge", async ({ page }) => {
    await page.goto("/dashboard", nav);
    await expect(page.getByText("LENDER")).toHaveCount(0);
    await expect(page.getByText("BORROWER")).toHaveCount(0);
  });

  test("DL-08 legacy viewer has no Withdraw", async ({ page }) => {
    const res = await page.goto("/direct/legacy/31337/0x0000000000000000000000000000000000000001", nav);
    expect(res?.status() ?? 500).toBeLessThan(400);
    await expect(page.getByText(/V0 CREDIT LINE/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Withdraw/i })).toHaveCount(0);
  });

  test("DL-09 390px shows identities and next action without overlapping chrome", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/direct", nav);
    await expect(page.getByRole("heading", { name: "DIRECT LENDING" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Create agreement/i })).toBeVisible();
    await page.locator("#mobile-nav-toggle").click();
    await expect(page.locator("#mobile-menu").getByRole("link", { name: /Direct lending/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 8,
    );
    expect(overflow).toBeFalsy();
  });

  test("DL-10 keyboard can reach Direct lending nav", async ({ page }) => {
    await page.goto("/direct", nav);
    let found = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const text = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText ?? "");
      if (/direct lending|create agreement|offer a credit line/i.test(text)) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });
});

test.describe("DL anvil protocol (fresh wallets)", () => {
  test("two new wallets create, accept, fund, borrow into vault", async () => {
    test.setTimeout(180_000);
    const rpcUrl = await resolveAnvilRpc();
    test.skip(!rpcUrl, "Anvil RPC not reachable");
    const manifest = loadManifest() as
      | (ReturnType<typeof loadManifest> & { directFactory?: `0x${string}`; loanToken?: `0x${string}`; venue?: `0x${string}`; swapRouter?: `0x${string}`; collateralToken?: `0x${string}` })
      | undefined;
    test.skip(!manifest?.directFactory || manifest.directFactory.startsWith("0x0000"), "directFactory not in manifest");

    const lender = clientsFor(8, rpcUrl);
    const borrower = clientsFor(9, rpcUrl);
    const { publicClient } = lender;

    async function ensureDrip(wallet: ReturnType<typeof clientsFor>) {
      const bal = await publicClient.readContract({
        address: manifest!.loanToken!,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      });
      if (bal > 0n) return;
      await send(wallet.walletClient, publicClient, {
        account: wallet.account,
        to: manifest!.faucet,
        data: encodeFunctionData({ abi: faucetAbi, functionName: "drip" }),
      });
    }
    await ensureDrip(lender);
    await ensureDrip(borrower);

    const terms = {
      lender: lender.account.address,
      borrower: borrower.account.address,
      loanToken: manifest!.loanToken!,
      creditLimit: 5_000_000000n,
      aprRay: 5n * 10n ** 25n,
      acceptanceLifetime: 7 * 24 * 3600,
      borrowPeriod: 365 * 24 * 3600,
      recallWindow: 300,
      venue: manifest!.venue!,
      swapRouter: manifest!.swapRouter!,
      otherToken: manifest!.collateralToken!,
    };

    const createHash = await send(lender.walletClient, publicClient, {
      account: lender.account,
      to: manifest!.directFactory!,
      data: encodeFunctionData({ abi: factoryAbi, functionName: "createFacility", args: [terms] }),
    });
    const receipt = await publicClient.getTransactionReceipt({ hash: createHash });
    const created = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "FacilityCreated" });
    const facility = created[0]!.args.facility;
    const termsHash = await publicClient.readContract({
      address: facility,
      abi: facilityAbi,
      functionName: "termsHash",
    });
    await send(borrower.walletClient, publicClient, {
      account: borrower.account,
      to: facility,
      data: encodeFunctionData({ abi: facilityAbi, functionName: "acceptTerms", args: [termsHash] }),
    });
    await send(lender.walletClient, publicClient, {
      account: lender.account,
      to: manifest!.loanToken!,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [facility, 2_000_000000n] }),
    });
    await send(lender.walletClient, publicClient, {
      account: lender.account,
      to: facility,
      data: encodeFunctionData({ abi: facilityAbi, functionName: "fund", args: [2_000_000000n] }),
    });
    await send(borrower.walletClient, publicClient, {
      account: borrower.account,
      to: manifest!.collateralToken!,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [facility, 10n ** 18n] }),
    });
    await send(borrower.walletClient, publicClient, {
      account: borrower.account,
      to: facility,
      data: encodeFunctionData({ abi: facilityAbi, functionName: "addCollateral", args: [10n ** 18n] }),
    });
    const now = BigInt(Math.floor(Date.now() / 1000) + 600);
    await send(borrower.walletClient, publicClient, {
      account: borrower.account,
      to: facility,
      data: encodeFunctionData({
        abi: facilityAbi,
        functionName: "borrow",
        args: [500_000000n, 10n ** 18n, now],
      }),
    });
    const vault = await publicClient.readContract({ address: facility, abi: facilityAbi, functionName: "vault" });
    expect(vault).not.toBe("0x0000000000000000000000000000000000000000");
  });
});
