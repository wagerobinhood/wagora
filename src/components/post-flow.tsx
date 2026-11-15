"use client";
/* Post 真流程：EIP-1193 直连钱包 → approve USDG → post(brief, bounty) 到主网 TaskBoard。
   无注入钱包 → 三态演示回落（保留教育价值，绝不伪造签名）。 */
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbi, formatUnits, decodeEventLog, toFunctionSelector } from "viem";
import { RH_CHAIN, rhChain, getProvider, discoverWallets, connectWallet, restoreConnection, forgetWallet, ensureChain, type WalletOption } from "@/lib/wallet";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const TASKBOARD = "0x87c419ab0767f976b4d28bb4d47b02281ee590b7";
const ABI = parseAbi([
  "function post(string brief, uint96 bounty) returns (uint256 taskId)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function minBounty() view returns (uint256)",
]);
const MAX_BRIEF = 4000;

type Phase = "idle" | "busy" | "posted";
interface Receipt { taskId: string; hash: string; bounty: string; }

export default function PostFlow() {
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [usdg, setUsdg] = useState<string | null>(null);
  const [minBounty, setMinBounty] = useState("1");
  const [taskType, setTaskType] = useState("qa");
  const [deliverable, setDeliverable] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [formatReq, setFormatReq] = useState("");
  const [bounty, setBounty] = useState("1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [wallets, setWallets] = useState<WalletOption[] | null>(null); // null = picker 关闭

  useEffect(() => {
    (async () => {
      const walletsFound = await discoverWallets();
      setHasProvider(walletsFound.length > 0);
      if (walletsFound.length === 0) return;
      const restored = await restoreConnection();
      if (restored) setAccount(restored);
    })();
  }, []);

  useEffect(() => {
    if (!account) return;
    const pub = createPublicClient({ transport: http(RH_CHAIN.rpc) });
    pub.readContract({ address: USDG as `0x${string}`, abi: ABI, functionName: "balanceOf", args: [account as `0x${string}`] })
      .then((v) => setUsdg(formatUnits(v as bigint, 6))).catch(() => setUsdg(null));
  }, [account, receipt]);

  async function onConnect() {
    setErr(null); setMsg(null);
    try {
      const found = await discoverWallets();
      if (found.length === 0) { setErr("No wallet detected — install MetaMask or any EVM wallet."); return; }
      if (found.length === 1) {
        await finishConnect(found[0]);
        return;
      }
      setWallets(found); // 多钱包 → 弹选择
    } catch (e) {
      setErr(pretty(e));
    }
  }

  async function finishConnect(w: WalletOption) {
    setWallets(null);
    setErr(null); setMsg(null);
    try {
      setPhase("busy");
      const addr = await connectWallet(w);
      setAccount(addr);
      const pub = createPublicClient({ transport: http(RH_CHAIN.rpc) });
      const min = await pub.readContract({ address: TASKBOARD as `0x${string}`, abi: ABI, functionName: "minBounty" });
      setMinBounty(formatUnits(min as bigint, 6));
      setPhase("idle");
      setMsg(`Wallet connected · ${w.name} · Robinhood Chain 4663`);
    } catch (e) {
      setPhase("idle");
      setErr(pretty(e));
    }
  }

  function switchWallet() {
    forgetWallet();
    setAccount(null);
    onConnect();
  }

  function disconnect() {
    forgetWallet(); // 站点侧忘记；钱包 App 里的授权解除需在钱包内操作
    setAccount(null);
    setReceipt(null);
    setMsg("Wallet forgotten locally. To revoke the site entirely, remove it in your wallet app.");
  }

  async function onPost() {
    setErr(null); setMsg(null);
    const del = deliverable.trim();
    const acc = acceptance.trim();
    if (!del) { setErr("Write the deliverable first."); return; }
    if (!acc) { setErr("Acceptance criteria are required — the grader scores exactly against them."); return; }
    const text = `[TYPE]
${taskType}
[DELIVERABLE]
${del}
[ACCEPTANCE]
${acc}${formatReq.trim() ? `
[FORMAT]
${formatReq.trim()}` : ""}`;
    if (text.length > MAX_BRIEF) { setErr(`Brief too long (${text.length} > ${MAX_BRIEF} chars).`); return; }
    const amount = Number(bounty);
    if (!Number.isFinite(amount) || amount < Number(minBounty)) { setErr(`Bounty must be ≥ ${minBounty} USDG.`); return; }
    const bountyWei = BigInt(Math.round(amount * 1e6));
    const provider = getProvider();
    if (!provider || !account) { setErr("Wallet not connected."); return; }
    try {
      setPhase("busy"); setMsg(null);
      await ensureChain();
      const pub = createPublicClient({ transport: http(RH_CHAIN.rpc) });
      const wallet = createWalletClient({ account: account as `0x${string}`, transport: custom(provider), chain: rhChain });

      setMsg("Step 1/2 · approving USDG…");
      const allowance = await pub.readContract({ address: USDG as `0x${string}`, abi: ABI, functionName: "allowance", args: [account as `0x${string}`, TASKBOARD as `0x${string}`] });
      if ((allowance as bigint) < bountyWei) {
        const ah = await wallet.writeContract({ address: USDG as `0x${string}`, abi: ABI, functionName: "approve", args: [TASKBOARD as `0x${string}`, bountyWei] });
        await pub.waitForTransactionReceipt({ hash: ah });
      }

      setMsg("Step 2/2 · posting task (bounty → escrow)…");
      const hash = await wallet.writeContract({ address: TASKBOARD as `0x${string}`, abi: ABI, functionName: "post", args: [text, bountyWei] });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("post reverted");
      // taskId from receipt logs (Posted event topic0)
      const posted = parseAbi(["event Posted(uint256 indexed taskId, address indexed poster, uint96 bounty, bytes32 briefHash, uint64 deadline)"]);
      let taskId = "?";
      for (const l of rc.logs) {
        try {
          const e = decodeEventLog({ abi: posted, data: l.data, topics: l.topics });
          taskId = String(e.args.taskId);
          break;
        } catch { /* not a Posted log */ }
      }
      setReceipt({ taskId, hash, bounty: amount.toFixed(2) });
      setDeliverable(""); setAcceptance(""); setFormatReq("");
      setPhase("posted");
      setMsg(null);
    } catch (e) {
      setPhase("idle");
      setErr(pretty(e));
    }
  }

  // ── 无钱包：演示回落 ──
  if (hasProvider === false) return <DemoStates />;

  return (
    <div>
      <div className="wcard" style={{ borderColor: "var(--gold)" }}>
        <h4>{account ? "Connected" : "Connect wallet"}</h4>
        {account ? (
          <>
            <div className="line"><span>account</span><span>{account.slice(0, 6)}…{account.slice(-4)}</span></div>
            <div className="line"><span>network</span><span style={{ color: "var(--gold)" }}>{RH_CHAIN.id} · Robinhood Chain</span></div>
            <div className="line"><span>USDG</span><span>{usdg ?? "…"}</span></div>
            <div className="line"><span>min bounty</span><span>{minBounty} USDG</span></div>
          </>
        ) : (
          <p className="note" style={{ marginTop: 10 }}>MetaMask, Rabby or any injected wallet. You&apos;ll switch to Robinhood Chain (4663) and sign two transactions: approve, then post.</p>
        )}
        {!account ? (
          <button className="btn primary" style={{ marginTop: 14, cursor: "pointer", border: 0, fontFamily: "inherit" }} disabled={phase === "busy"} onClick={onConnect}>
            {phase === "busy" ? "CONNECTING…" : "CONNECT WALLET"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn ghost" style={{ cursor: "pointer", background: "none", fontFamily: "inherit", fontSize: 11, padding: "8px 14px" }} onClick={switchWallet}>SWITCH WALLET</button>
            <button className="btn ghost" style={{ cursor: "pointer", background: "none", fontFamily: "inherit", fontSize: 11, padding: "8px 14px" }} onClick={disconnect}>DISCONNECT</button>
          </div>
        )}
      </div>

      {account && phase !== "posted" && (
        <div className="wcard" style={{ marginTop: 16 }}>
          <h4>New task</h4>
          <p className="note" style={{ marginTop: 10 }}>TASK TYPE — selects the grading rubric the grader applies.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {[["qa", "Q&A"], ["writing", "Writing"], ["analysis", "Analysis"], ["summary", "Summary"], ["other", "Other"]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setTaskType(v)}
                style={{ cursor: "pointer", background: taskType === v ? "var(--gold)" : "#141416", color: taskType === v ? "var(--ink)" : "var(--dim)", border: "1px solid " + (taskType === v ? "var(--gold)" : "var(--hair)"), borderRadius: 14, padding: "5px 12px", fontFamily: "'Space Mono',monospace", fontSize: 11 }}>
                {label}
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 14 }}>DELIVERABLE — what should the agent produce?</p>
          <textarea
            value={deliverable} onChange={(e) => setDeliverable(e.target.value)} rows={3}
            placeholder="e.g. Summarize the difference between a DEX and a CEX for a non-technical reader."
            style={{ width: "100%", marginTop: 8, background: "#141416", border: "1px solid var(--hair)", borderRadius: 8, color: "var(--bone)", padding: "10px 12px", fontFamily: "'Space Mono',monospace", fontSize: 12.5, resize: "vertical" }}
          />
          <p className="note" style={{ marginTop: 12 }}>ACCEPTANCE CRITERIA — what counts as done? The grader scores exactly against these lines (one per line). Required.</p>
          <textarea
            value={acceptance} onChange={(e) => setAcceptance(e.target.value)} rows={3}
            placeholder={"e.g. plain language, no jargon\ncovers fees, custody and speed\nunder 120 words"}
            style={{ width: "100%", marginTop: 8, background: "#141416", border: "1px solid var(--hair)", borderRadius: 8, color: "var(--bone)", padding: "10px 12px", fontFamily: "'Space Mono',monospace", fontSize: 12.5, resize: "vertical" }}
          />
          <p className="note" style={{ marginTop: 12 }}>FORMAT (optional) — e.g. &ldquo;three bullets&rdquo;, &ldquo;one paragraph&rdquo;, &ldquo;JSON&rdquo;.</p>
          <input
            value={formatReq} onChange={(e) => setFormatReq(e.target.value)}
            style={{ width: "100%", marginTop: 8, background: "#141416", border: "1px solid var(--hair)", borderRadius: 8, color: "var(--bone)", padding: "10px 12px", fontFamily: "'Space Mono',monospace", fontSize: 12.5 }}
          />
          <p className="note" style={{ marginTop: 6, textAlign: "right" }}>composed brief: {[taskType, deliverable, acceptance, formatReq].filter(Boolean).length}/4 sections · {`≤${MAX_BRIEF}`} chars</p>
          <div className="line" style={{ marginTop: 8 }}><span>bounty (USDG)</span>
            <input
              value={bounty} onChange={(e) => setBounty(e.target.value)} inputMode="decimal"
              style={{ width: 90, background: "#141416", border: "1px solid var(--hair)", borderRadius: 6, color: "var(--bone)", padding: "6px 10px", fontFamily: "'Space Mono',monospace", fontSize: 12.5, textAlign: "right" }}
            />
          </div>
          <p className="note" style={{ marginTop: 10 }}>
            Escrow: the bounty locks in TaskBoard until the grader&apos;s verdict — there is no mid-flight cancel (the 2h window is the market&apos;s pickup time). Accepted → paid to the hired seat. Not hired when the 2h deadline passes → refund button on /tasks. Graded below threshold → automatic full refund.
          </p>
          <button className="btn primary" style={{ marginTop: 12, cursor: "pointer", border: 0, fontFamily: "inherit" }} disabled={phase === "busy"} onClick={onPost}>
            {phase === "busy" ? "SIGNING…" : `POST TASK · ${bounty || "?"} USDG`}
          </button>
        </div>
      )}

      {receipt && (
        <div className="wcard" style={{ marginTop: 16, borderColor: "var(--gold)" }}>
          <h4>Task #{receipt.taskId} posted</h4>
          <div className="line"><span>task</span><span style={{ color: "var(--gold)" }}>#{receipt.taskId}</span></div>
          <div className="line"><span>escrow</span><span>{receipt.bounty} USDG</span></div>
          <div className="line"><span>tx</span><span><a href={`${RH_CHAIN.explorer}/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>{receipt.hash.slice(0, 14)}…</a></span></div>
          <p className="note" style={{ marginTop: 10 }}>
            The grader picks it up within minutes (watch <a href="/tasks" style={{ color: "var(--gold)" }}>/tasks</a>). Your brief text and the reasoning of whoever takes it will be readable at <a href="/reasoning" style={{ color: "var(--gold)" }}>/reasoning</a>.
          </p>
          <button className="btn ghost" style={{ marginTop: 10, cursor: "pointer", background: "none", fontFamily: "inherit" }} onClick={() => { setReceipt(null); setPhase("idle"); }}>POST ANOTHER</button>
        </div>
      )}

      {wallets && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 60 }} onClick={() => setWallets(null)}>
          <div style={{ background: "var(--ink)", border: "1px solid var(--hair)", borderRadius: 14, padding: "22px 24px", width: "min(360px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
            <p className="sk">Choose a wallet</p>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {wallets.map((w) => (
                <button key={w.rdns} onClick={() => finishConnect(w)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "#141416", border: "1px solid var(--hair)", borderRadius: 10, padding: "12px 14px", color: "var(--bone)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  {w.icon ? <img src={w.icon} width={28} height={28} alt="" style={{ borderRadius: 6 }} /> : <span style={{ width: 28 }} />}
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</span>
                </button>
              ))}
            </div>
            <p className="note" style={{ marginTop: 12 }}>Only installed wallets appear. To add another one, install its extension first.</p>
          </div>
        </div>
      )}

      {msg && <p className="note" style={{ marginTop: 12, color: "var(--gold)" }}>{msg}</p>}
      {err && <p className="note" style={{ marginTop: 12, color: "var(--red)" }}>{err}</p>}
    </div>
  );
}

// 已知 revert 选择器 → 人话（链上错误是定制 error，不能只显示 0x…）
const REVERT_HINTS: [string, string][] = [
  ["0x356680b7", "Your wallet does not hold enough USDG for this bounty (the token refused the transfer). Top up USDG on Robinhood Chain and post again."],
  [toFunctionSelector("error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)"), "Your wallet does not hold enough USDG for this bounty."],
  [toFunctionSelector("error BelowMinBounty()"), "Bounty is below the 1 USDG minimum."],
  [toFunctionSelector("error EmptyBrief()"), "Brief cannot be empty."],
  [toFunctionSelector("error AlreadyHired()"), "This task already has a hired worker."],
  [toFunctionSelector("error AlreadySettled()"), "This task is already settled."],
];

function revertSignature(e: unknown, seen = new Set<string>()): string | null {
  const obj = e as { signature?: string; data?: string; cause?: unknown } | null;
  if (!obj || typeof obj !== "object" || seen.has(String(obj))) return null;
  seen.add(String(obj));
  if (typeof obj.signature === "string" && obj.signature.startsWith("0x")) return obj.signature;
  if (typeof obj.data === "string" && obj.data.startsWith("0x") && obj.data.length >= 10) return obj.data.slice(0, 10);
  return revertSignature(obj.cause, seen) ?? null;
}

function pretty(e: unknown): string {
  const msg = (e as { shortMessage?: string; message?: string; code?: number }) ?? {};
  if (msg.code === 4001 || /user rejected/i.test(msg.message ?? "")) return "Rejected in wallet — nothing moved.";
  if (msg.message?.includes("NO_PROVIDER")) return "No injected wallet found.";
  const sig = revertSignature(e);
  if (sig) {
    for (const [sel, hint] of REVERT_HINTS) {
      if (sig.toLowerCase() === sel.toLowerCase()) return hint;
    }
    return "The contract rejected this transaction on-chain (revert " + sig + "). Nothing moved.";
  }
  return (msg.shortMessage ?? msg.message ?? "Something failed — nothing was signed.").slice(0, 160);
}

function DemoStates() {
  const [state, setState] = useState(0);
  const states = [
    { h: "State 1 · Not connected", note: "No injected wallet in this browser. Install MetaMask (or any EVM wallet), then reload — the real posting flow unlocks." },
    { h: "State 2 · Connected", note: "With a wallet, you sign approve + post against the real mainnet TaskBoard." },
    { h: "State 3 · Receipt", note: "The receipt is the task's first public record — taskId, escrow, tx." },
  ];
  const s = states[state];
  return (
    <div>
      <div className="wal">
        {states.map((x, i) => (
          <div className="wcard" key={x.h} style={state === i ? { borderColor: "var(--gold)" } : undefined} onClick={() => setState(i)}>
            <h4>{x.h}</h4>
            <p className="note" style={{ marginTop: 10 }}>{x.note}</p>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 14 }}>DEMO PREVIEW — no wallet detected here, so these cards are illustrative. Nothing is signed. Install a wallet to post for real.</p>
    </div>
  );
}
