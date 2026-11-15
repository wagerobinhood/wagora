export function MetaRail({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="meta">
      {items.map(([k, v, cls]) => (
        <span key={k}>{k} / <b className={cls}>{v}</b></span>
      ))}
    </div>
  );
}

export function CaBox({ address, label }: { address: string | null; label?: string }) {
  // CA 二态（RH 档案）：未配置 = EVM ZERO 全文置灰（不可复制、无 Explorer 链接）；真地址全文渲染。
  if (!address || /0x0{40}/i.test(address)) {
    // RH/BNB 惯例：EVM ZERO 全文置灰展示，不可复制、无 Explorer 链接
    return (
      <span className="mono" style={{ color: "var(--dim)", opacity: 0.55, userSelect: "none" }}>
        0x0000000000000000000000000000000000000000
        {label ? <span className="tag ph" style={{ marginLeft: 8 }}>{label}</span> : null}
      </span>
    );
  }
  return <span className="addr copy">{address}</span>;
}

export function DecisionField() {
  // 标志性瞬间：决策流场（SVG，保真要求 §7.1；Three.js 为允许的迭代实现）
  return (
    <svg className="field" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g stroke="rgba(234,230,220,.14)" fill="none" strokeWidth="1">
        <path d="M-50 120 C 300 160, 600 300, 860 380"/><path d="M-50 260 C 280 280, 560 340, 850 390"/>
        <path d="M-50 430 C 320 400, 580 400, 855 405"/><path d="M-50 590 C 340 560, 620 470, 865 425"/>
        <path d="M1250 140 C 980 220, 900 320, 870 385"/><path d="M1250 330 C 1000 350, 930 380, 872 400"/>
        <path d="M1250 560 C 960 520, 920 440, 868 415"/>
      </g>
      <g fill="rgba(234,230,220,.4)">
        <circle cx="240" cy="212" r="2.4"/><circle cx="470" cy="304" r="2"/><circle cx="660" cy="352" r="2.6"/>
        <circle cx="1060" cy="250" r="2.2"/><circle cx="990" cy="380" r="2"/><circle cx="1020" cy="500" r="2.4"/>
        <circle cx="180" cy="470" r="2"/><circle cx="380" cy="540" r="2.2"/>
      </g>
      <circle cx="865" cy="400" r="58" fill="none" stroke="#E3B34C" strokeWidth="1.4" opacity=".9"/>
      <circle cx="865" cy="400" r="88" fill="none" stroke="rgba(227,179,76,.35)" strokeWidth="1"/>
      <text x="865" y="406" textAnchor="middle" fontFamily="Space Mono" fontSize="15" fill="#E3B34C">WAGE</text>
      {/* 标签纵向收拢在 y∈[200,480]：带鱼屏下 slice 竖向裁切最狠，收拢保证所有席位名可见 */}
      <text x="205" y="230" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fill="rgba(234,230,220,.55)">CLAUDE</text>
      <text x="1090" y="240" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fill="rgba(234,230,220,.55)">GPT</text>
      <text x="1052" y="472" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fill="rgba(234,230,220,.55)">GEMINI</text>
      <text x="200" y="472" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fill="rgba(234,230,220,.55)">GROK</text>
      <text x="620" y="330" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fill="rgba(234,230,220,.45)">DEEPSEEK</text>
    </svg>
  );
}
