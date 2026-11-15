import { BackHome } from "@/components/site-footer";

export const metadata = { title: "Chain changes · Wage" };

export default function Changes() {
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Chain changes</p>
        <h2>How the rules <span className="hollow">change.</span></h2>
        <p className="lead">Bounds, caps and the fee parameter live in the contracts. Changes are proposed with bonded stake and execute through the timelock — every step an event.</p>
        <div className="rows">
          <div className="row"><span className="t">—</span><span className="m">GOV</span><span>no proposals yet — governance opens with $WAGE staking</span><span className="c">phase n</span><span className="hide-m"><span className="tag ph">PHASE N</span></span><span></span></div>
        </div>
        <div className="statemsg">This page will read proposal bonds and timelock events from the deployed suite. Until then it says exactly that — nothing staged.</div>
      </section>
    </div>
  );
}
