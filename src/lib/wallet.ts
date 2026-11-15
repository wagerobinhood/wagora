// RH 主网链元数据 + EIP-1193/EIP-6963 客户端助手（仅浏览器使用；客户端组件专用，勿在服务端引用）。
// EIP-6963 多钱包发现：列出所有已安装钱包供用户选择，而不是静默用最后注入的那个。

import { defineChain } from 'viem';

export const RH_CHAIN = {
  id: 4663,
  hexId: '0x1237',
  name: 'Robinhood Chain',
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

/** viem 标准链对象（客户端 writeContract 用） */
export const rhChain = defineChain({
  id: RH_CHAIN.id,
  name: RH_CHAIN.name,
  nativeCurrency: RH_CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [RH_CHAIN.rpc] } },
  blockExplorers: { default: { name: 'Blockscout', url: RH_CHAIN.explorer } },
});

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WalletOption {
  uuid: string;
  name: string;
  icon: string; // data URI
  rdns: string;
  provider: Eip1193;
}

const SS_KEY = 'wage.wallet.rdns';

let selected: WalletOption | null = null;

/** 当前生效的 provider：优先用户选择的钱包，回落 window.ethereum */
export function getProvider(): Eip1193 | null {
  if (typeof window === 'undefined') return null;
  if (selected) return selected.provider;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

/** EIP-6963 发现：广播 requestProvider，收集 400ms 内的 announce */
export function discoverWallets(): Promise<WalletOption[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve([]);
    const found = new Map<string, WalletOption>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>).detail;
      if (detail?.info?.rdns && detail.provider && !found.has(detail.info.rdns)) {
        found.set(detail.info.rdns, { ...detail.info, provider: detail.provider });
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      // 兜底：没有任何 6963 实现（老钱包）时用 window.ethereum
      const fallbackEth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
      if (fallbackEth && found.size === 0) {
        found.set('fallback.ethereum', { uuid: 'fallback', name: 'Browser wallet', icon: '', rdns: 'fallback.ethereum', provider: fallbackEth });
      }
      resolve([...found.values()]);
    }, 400);
  });
}

export async function connectWallet(wallet: WalletOption): Promise<string> {
  const accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('NO_ACCOUNTS');
  selected = wallet;
  try { sessionStorage.setItem(SS_KEY, wallet.rdns); } catch { /* 隐私模式忽略 */ }
  await ensureChain();
  return accounts[0];
}

/** 静默恢复上次会话（eth_accounts 不弹窗；钱包侧已解除授权时返回 null → 需重新连接） */
export async function restoreConnection(): Promise<string | null> {
  try {
    const rdns = sessionStorage.getItem(SS_KEY);
    if (!rdns) return null;
    const wallets = await discoverWallets();
    const wallet = wallets.find((w) => w.rdns === rdns);
    if (!wallet) return null;
    const accounts = (await wallet.provider.request({ method: 'eth_accounts' })) as string[];
    if (!accounts?.length) return null;
    selected = wallet;
    await ensureChain();
    return accounts[0];
  } catch {
    return null;
  }
}

/** 忘记本地选择（钱包侧的授权解除需要在钱包应用里操作） */
export function forgetWallet(): void {
  selected = null;
  try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
}

export async function ensureChain(): Promise<void> {
  const p = getProvider();
  if (!p) throw new Error('NO_PROVIDER');
  const current = (await p.request({ method: 'eth_chainId' })) as string;
  if (Number.parseInt(current, 16) === RH_CHAIN.id) return;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RH_CHAIN.hexId }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: RH_CHAIN.hexId,
          chainName: RH_CHAIN.name,
          nativeCurrency: RH_CHAIN.nativeCurrency,
          rpcUrls: [RH_CHAIN.rpc],
          blockExplorerUrls: [RH_CHAIN.explorer],
        }],
      });
    } else {
      throw e;
    }
  }
  const after = (await p.request({ method: 'eth_chainId' })) as string;
  if (Number.parseInt(after, 16) !== RH_CHAIN.id) throw new Error('WRONG_CHAIN');
}
