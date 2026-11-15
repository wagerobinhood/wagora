import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// 链上任务思考全文（metronome 写入共享卷 task-reasons.json；链上只有哈希）。
// 记录从任务 #8 起留存；更早的判决链上仅哈希可查（Blockscout）。缺失 → 空数组，绝不编造。

export interface TaskReason {
  taskId: number;
  at: string;
  brief: string;
  worker: string;
  bidMode?: string;
  submission: string;
  grader: string;
  promptVersionHash?: string;
  gradeRaw: string;
  confidence: number;   // bps
  threshold: number;    // bps
  accept: boolean;
  reasoningHash: string;
  txs: { post: string; hire: string; record: string; settle: string };
}

function toReasons(v: unknown): TaskReason[] {
  if (!Array.isArray(v)) return [];
  const out: TaskReason[] = [];
  for (const r of v) {
    const x = r as Record<string, unknown>;
    const txs = (x.txs ?? {}) as Record<string, unknown>;
    const tid = Number(x.taskId);
    if (!Number.isFinite(tid)) continue;
    out.push({
      taskId: tid,
      at: typeof x.at === 'string' ? x.at : '',
      brief: typeof x.brief === 'string' ? x.brief : '',
      worker: typeof x.worker === 'string' ? x.worker : 'unknown',
      bidMode: typeof x.bidMode === 'string' ? x.bidMode : undefined,
      submission: typeof x.submission === 'string' ? x.submission : '',
      grader: typeof x.grader === 'string' ? x.grader : 'unknown',
      promptVersionHash: typeof x.promptVersionHash === 'string' ? x.promptVersionHash : undefined,
      gradeRaw: typeof x.gradeRaw === 'string' ? x.gradeRaw : '',
      confidence: Number(x.confidence) || 0,
      threshold: Number(x.threshold) || 0,
      accept: x.accept === true,
      reasoningHash: typeof x.reasoningHash === 'string' ? x.reasoningHash : '',
      txs: {
        post: typeof txs.post === 'string' ? txs.post : '',
        hire: typeof txs.hire === 'string' ? txs.hire : '',
        record: typeof txs.record === 'string' ? txs.record : '',
        settle: typeof txs.settle === 'string' ? txs.settle : '',
      },
    });
  }
  return out.reverse(); // 最新在前
}

export function readTaskReasons(): TaskReason[] {
  const dir = process.env.ENGINE_STATE_DIR || 'engine/state';
  try {
    const raw = fs.readFileSync(path.join(dir, 'task-reasons.json'), 'utf8');
    return toReasons(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function getTaskReason(taskId: number): TaskReason | null {
  return readTaskReasons().find((r) => r.taskId === taskId) ?? null;
}
