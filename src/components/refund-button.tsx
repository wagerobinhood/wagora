"use client";
/* 退款按钮：仅当（当前钱包 = poster）且（任务过期未 hire）时出现。
   合约侧 refund() 自校验 poster 与 deadline——按钮只是入口，链上是最终裁决。 */
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbi } from "viem";
import { RH_CHAIN, rhChain, getProvider } from "@/lib/wallet";

const TASKBOARD = "0x87c419ab0767f976b4d28bb4d47b02281ee590b7" as const;
const ABI = parseAbi(["function refund(uint256 taskId)"]);

export default function RefundButton({ taskId, poster, deadlineSec }: { taskId: number; poster: string; deadlineSec: number | null }) {
  const [account, setAccount] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const p = getProvider();
    if (!p) return;
    p.request({ method: "eth_accounts" }).then((a) => setAccount((a as string[])?.[0] ?? null)).catch(() => {});
  }, []);

  const mine = account && account.toLowerCase() === poster.toLowerCase();
  const expired = deadlineSec ? Date.now() / 1000 > deadlineSec : false;
  if (!mine || !expired || state === "done") return null;

  async function refund() {
    const p = getProvider();
    if (!p || !account) return;
    setState("busy");
    try {
      const pub = createPublicClient({ transport: http(RH_CHAIN.rpc) });
      const wallet = createWalletClient({ account: account as `0x${string}`, transport: custom(p), chain: rhChain });
      const hash = await wallet.writeContract({ address: TASKBOARD, abi: ABI, functionName: "refund", args: [BigInt(taskId)] });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("refund reverted");
      setState("done");
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string; code?: number });
      setMsg(m.code === 4001 ? "Rejected in wallet." : (m.shortMessage ?? m.message ?? "failed").slice(0, 120));
      setState("err");
    }
  }

  return (
    <span>
      {state !== "err" ? (
        <button
          onClick={refund}
          disabled={state === "busy"}
          style={{ cursor: "pointer", background: "none", border: "1px solid rgba(227,179,76,.5)", color: "var(--gold)", borderRadius: 14, padding: "2px 10px", fontFamily: "'Space Mono',monospace", fontSize: 10.5 }}
        >
          {state === "busy" ? "REFUNDING…" : "REFUND"}
        </button>
      ) : (
        <span className="note" style={{ color: "var(--red)" }}>{msg}</span>
      )}
    </span>
  );
}
