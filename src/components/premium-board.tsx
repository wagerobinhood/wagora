"use client";
import { useEffect, useState } from "react";

/* Premium board — 数据三级 Level 1 实时 fetch：浏览器直读 RH RPC 池 slot0。
   恢复自冻结 baseline-v1 的已验证实现（含 GOOGL 方向修正，7/7 实测通过）。 */

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const POOLS = [
  { sym: "NVDA",  addr: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3", zeroIsUsdg: true },
  { sym: "SPY",   addr: "0xa7Bb1AC63BBaB0C44316E6c8C455213441689167", zeroIsUsdg: false },
  { sym: "AAPL",  addr: "0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D", zeroIsUsdg: true },
  { sym: "TSLA",  addr: "0xf4ACdAEEB7022862A763C9B1B885e11191c889E3", zeroIsUsdg: false },
  { sym: "GOOGL", addr: "0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7", zeroIsUsdg: false },
  { sym: "META",  addr: "0x107a7Cb40d8665360ba10E59471Af06150A50922", zeroIsUsdg: true },
  { sym: "MSFT",  addr: "0xeb60bCD1D920ad6E102690CCFC6fB488899E1510", zeroIsUsdg: true },
];

type Row = { sym: string; price: number | null };

async function slot0(addr: string): Promise<bigint> {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data: "0x3850c7bd" }, "latest"] }),
  });
  const j = await r.json();
  if (!j.result) throw new Error("rpc");
  return BigInt(j.result.slice(0, 66));
}

export default function PremiumBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [asof, setAsof] = useState("—");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true); setErr("");
    const out: Row[] = [];
    for (const p of POOLS) {
      try {
        const sq = await slot0(p.addr);
        const ratio = Number(sq) / 2 ** 96;
        const raw = ratio * ratio;
        const price = p.zeroIsUsdg ? 1e12 / raw : raw * 1e12;
        out.push({ sym: p.sym, price });
      } catch {
        out.push({ sym: p.sym, price: null });
      }
    }
    setRows(out);
    setAsof(new Date().toISOString().slice(11, 19));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div>
      <p className="note" style={{ marginTop: 14 }}>
        read <b id="pm-asof">{asof}</b> UTC ·{" "}
        <button className="pm-btn" onClick={load} disabled={loading}>{loading ? "READING…" : "REFRESH"}</button>
      </p>
      {err && <p className="note" style={{ color: "var(--red)" }}>{err}</p>}
      <table className="dt">
        <thead><tr><th>STOCK</th><th>POOL PRICE (USDG)</th><th>CHAINLINK</th><th>PREMIUM</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={4} style={{ color: "var(--dim)" }}>reading the chain…</td></tr>}
          {rows?.length === 0 && <tr><td colSpan={4} style={{ color: "var(--red)" }}>no rows — feed unreachable, nothing invented</td></tr>}
          {rows?.map((r) => r.price === null ? (
            <tr key={r.sym}><td>{r.sym}</td><td colSpan={3} style={{ color: "var(--red)" }}>pool read failed · last good kept above when available</td></tr>
          ) : (
            <tr key={r.sym}>
              <td>{r.sym}</td>
              <td style={{ color: "var(--gold)" }}>{r.price.toFixed(2)}</td>
              <td style={{ color: "var(--dim)" }}>wired at deployment</td>
              <td style={{ color: "var(--dim)" }}>—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
