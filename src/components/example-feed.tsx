"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/* 数据页共用：EXAMPLE 态表 + 四态说明。合约部署后由 live_contract_deployed 切换
   为链上事件读取（viem log 轮询 20s）；当前为数据三级 Level 3（显式 EXAMPLE 角标）。 */

export type Row = { t: string; m: string; text: string; c: string; tag: "paid" | "ref" | "ph" | "escrow"; tagText: string };

export function ExampleRows({ rows }: { rows: Row[] }) {
  return (
    <div className="rows">
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <span className="t">{r.t}</span>
          <span className="m">{r.m}</span>
          <span>{r.text}</span>
          <span className="c">{r.c}</span>
          <span className="hide-m"><span className={"tag " + r.tag}>{r.tagText}</span></span>
          <span><span className="tag ex">EXAMPLE</span></span>
        </div>
      ))}
    </div>
  );
}

export function DataStates({ extra }: { extra?: string }) {
  const [clock, setClock] = useState("LIVE DATA · CONNECTING");
  useEffect(() => {
    const id = setInterval(() => setClock((s) => (s.startsWith("NOT READING") ? "LIVE DATA · CONNECTING" : "NOT READING — retrying every 20 seconds")), 20000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="statemsg">
      <b>States:</b> loading → rows render here · empty → guidance shown · error → <b>{clock}</b> (public, never faked).{" "}
      Rows marked <span className="tag ex">EXAMPLE</span> are illustrative placeholders — live chain rows replace them wherever a feed exists.{extra ? " " + extra : ""}{" "}
      <Link href="/post">Submit a task →</Link>
    </div>
  );
}
