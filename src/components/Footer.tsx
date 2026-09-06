import { Link } from "react-router-dom";
import { Wordmark } from "@/components/Wordmark";

const openCookieSettings = () => {
  if (typeof window !== "undefined" && window.Cookiebot) {
    window.Cookiebot.renew();
  }
};

const lexend = { fontFamily: "'Lexend', sans-serif" };
const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };

const Footer = () => {
  return (
    <footer style={{ backgroundColor: "#1a2744", color: "#ffffff" }}>
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 md:col-span-1">
          <Wordmark theme="dark" size={24} />
          <div className="mt-4 space-y-1 text-xs text-slate-300" style={lexend}>
            <p>TradeStone Group Ltd, registered in England and Wales.</p>
            <p>Company no. 17229262.</p>
            <p>Registered office: 82a James Carter Road, Mildenhall, Bury St. Edmunds, IP28 7DE.</p>
            <p>
              <a href="mailto:support@tradesltd.co.uk" className="hover:text-[#f07820]">support@tradesltd.co.uk</a>
            </p>
            <p>ICO Registration: C1969229</p>
          </div>
        </div>

        <div style={lexend}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={barlow}>Platform</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li><Link to="/contractors" className="hover:text-[#f07820]">Find Contractors</Link></li>
            <li><Link to="/how-it-works" className="hover:text-[#f07820]">How It Works</Link></li>
            <li><Link to="/#pricing" className="hover:text-[#f07820]">Pricing</Link></li>
          </ul>
        </div>

        <div style={lexend}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={barlow}>Legal</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li><Link to="/privacy" className="hover:text-[#f07820]">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-[#f07820]">Terms &amp; Conditions</Link></li>
            <li><Link to="/cookies" className="hover:text-[#f07820]">Cookie Policy</Link></li>
            <li>
              <button
                type="button"
                onClick={openCookieSettings}
                className="p-0 border-0 bg-transparent text-inherit font-inherit cursor-pointer hover:text-[#f07820]"
              >
                Cookie Settings
              </button>
            </li>
          </ul>
        </div>

        <div style={lexend}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={barlow}>Account</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li><Link to="/auth" className="hover:text-[#f07820]">Log in</Link></li>
            <li><Link to="/auth" className="hover:text-[#f07820]">Sign up</Link></li>
          </ul>
        </div>
      </div>

      <div style={{ backgroundColor: "#111e35" }}>
        <p
          className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-400"
          style={lexend}
        >
          TradeStone is not a party to any contract between users. We do not verify contractor qualifications or insurance.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
