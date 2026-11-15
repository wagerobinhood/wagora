import { readDeskState } from "@/lib/desk-state";

// 引擎纸面台账的公开只读端点（agent / 外部程序同源可读）。
// 数据由 desk-loop 每小时写入；引擎未运行 → 404。
export const dynamic = "force-dynamic";

export async function GET() {
  const s = readDeskState();
  if (!s) {
    return Response.json({ ok: false, error: "no desk ledger published yet" }, { status: 404 });
  }
  return Response.json({ ok: true, data: s }, { headers: { "cache-control": "no-store" } });
}
