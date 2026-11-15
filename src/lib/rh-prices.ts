import 'server-only';

// RH 主网股票池价格（与引擎 paper-desk 同源同算，仅服务端使用）。
// 池 slot0 直读；单一池失败跳过 —— 绝不编造价格。

export const RH_RPC = 'https://rpc.mainnet.chain.robinhood.com';

export interface RhAsset {
  sym: string;
  addr: string;
  zeroIsUsdg: boolean;
}

export const RH_ASSETS: RhAsset[] = [
  { sym: 'NVDA', addr: '0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3', zeroIsUsdg: true },
  { sym: 'SPY', addr: '0xa7Bb1AC63BBaB0C44316E6c8C455213441689167', zeroIsUsdg: false },
  { sym: 'AAPL', addr: '0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D', zeroIsUsdg: true },
  { sym: 'TSLA', addr: '0xf4ACdAEEB7022862A763C9B1B885e11191c889E3', zeroIsUsdg: false },
  { sym: 'GOOGL', addr: '0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7', zeroIsUsdg: false },
  { sym: 'META', addr: '0x107a7Cb40d8665360ba10E59471Af06150A50922', zeroIsUsdg: true },
  { sym: 'MSFT', addr: '0xeb60bCD1D920ad6E102690CCFC6fB488899E1510', zeroIsUsdg: true },
];

export type PriceMap = Record<string, number>;

export async function fetchRhPrices(): Promise<PriceMap | null> {
  const out: PriceMap = {};
  await Promise.all(
    RH_ASSETS.map(async (p) => {
      try {
        const r = await fetch(RH_RPC, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: p.addr, data: '0x3850c7bd' }, 'latest'] }),
          signal: AbortSignal.timeout(8000),
        });
        const j = (await r.json()) as { result?: string };
        if (!j.result) return;
        const sq = BigInt(j.result.slice(0, 66));
        const ratio = Number(sq) / 2 ** 96;
        const raw = ratio * ratio;
        out[p.sym] = p.zeroIsUsdg ? 1e12 / raw : raw * 1e12; // USDG(6) per whole token
      } catch { /* 单池失败跳过 */ }
    }),
  );
  return Object.keys(out).length ? out : null;
}
