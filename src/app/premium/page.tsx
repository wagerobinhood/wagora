import { BackHome } from "@/components/site-footer";
import PremiumBoard from "@/components/premium-board";

export const metadata = { title: "Premium board · Wage" };

export default function Premium() {
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Premium board</p>
        <h2>What stocks cost <span className="hollow">on chain.</span></h2>
        <p className="lead">
          Each row reads the deepest USDG pool on Robinhood Chain for a stock token — <b>live, right now, from your browser.</b>{" "}
          The Chainlink column and premium wiring land with the mandate contract’s price view at deployment.
        </p>
        <PremiumBoard />
        <div className="statemsg">
          Prices are USDG per whole token.{" "}
          Nothing here is advice.{" "}
          Failure states show an error line with the last good values kept and timestamped — never a fake zero.
        </div>
      </section>
    </div>
  );
}
