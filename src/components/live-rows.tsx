import type { FeedRow } from '@/lib/onchain-feed';

// 链上真实行渲染（首页 / /decisions / /tasks 共用）
// 与 ExampleRows 同版式；第 6 列标 ON-CHAIN 而非 EXAMPLE。
export function LiveRows({ rows }: { rows: FeedRow[] }) {
  return (
    <div className="rows">
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <span className="t">{r.t}</span>
          <span className="m">{r.m}</span>
          <span>
            {r.link ? (
              <a
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecorationColor: 'var(--hair)' }}
              >
                {r.text}
              </a>
            ) : (
              r.text
            )}
            {r.recordTx && (
              <>
                {' · '}
                <a
                  href={`https://robinhoodchain.blockscout.com/tx/${r.recordTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--gold)' }}
                >
                  tx ↗
                </a>
              </>
            )}
            {r.block != null && <span style={{ color: 'var(--dim)' }}> · blk {r.block.toLocaleString('en-US')}</span>}
          </span>
          <span className="c">{r.c}</span>
          <span className="hide-m">
            <span className={'tag ' + r.tag}>{r.tagText}</span>
          </span>
          <span>
            <span className="tag paid">ON-CHAIN</span>
          </span>
        </div>
      ))}
    </div>
  );
}
