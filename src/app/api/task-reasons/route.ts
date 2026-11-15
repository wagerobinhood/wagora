import { readTaskReasons } from "@/lib/task-reasons";

// 链上任务思考全文的公开只读端点（与 /reasoning 页同源）。
export const dynamic = "force-dynamic";

export async function GET() {
  const records = readTaskReasons();
  return Response.json(
    { ok: true, count: records.length, data: records },
    { headers: { "cache-control": "no-store" } },
  );
}
