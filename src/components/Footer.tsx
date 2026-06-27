import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer style={{ backgroundColor: "#1a2744", color: "#ffffff" }}>
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div
            className="text-2xl uppercase tracking-wide"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}
          >
            <span style={{ color: "#ffffff" }}>TRADE</span>
            <span style={{ color: "#f07820" }}>STONE</span>
          </div>
          <p className="text-sm italic mt-3 text-slate-300" style={{ fontFamily: "'Source Serif 4', serif" }}>
            Connecting trades, businesses and homeowners
          </p>
          <p className="text-xs mt-4 text-slate-400" style={{ fontFamily: "'Lexend', sans-serif" }}>
            © 2026 TradeStone Group Ltd. All rights reserved.
          </p>
        </div>

        <div style={{ fontFamily: "'Lexend', sans-serif" }}>
          <h3 className="font-semibold mb-3">Legal</h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/privacy" className="hover:text-[#f07820]">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-[#f07820]">Terms &amp; Conditions</Link></li>
            <li><Link to="/cookies" className="hover:text-[#f07820]">Cookie Policy</Link></li>
          </ul>
        </div>

        <div className="text-sm text-slate-300" style={{ fontFamily: "'Lexend', sans-serif" }}>
          <h3 className="font-semibold mb-3 text-white">Company</h3>
          <p>TradeStone Group Ltd</p>
          <p>Company No. 17229262</p>
          <p>Registered in England &amp; Wales</p>
          <p>82a James Carter Road, Mildenhall, Bury St. Edmunds, IP28 7DE</p>
          <p>
            <a href="mailto:rb.tradestone@gmail.com" className="hover:text-[#f07820]">rb.tradestone@gmail.com</a>
          </p>
          <p>ICO Registration: C1969229</p>
        </div>
      </div>

      <div style={{ backgroundColor: "#111e35" }}>
        <p
          className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-400"
          style={{ fontFamily: "'Lexend', sans-serif" }}
        >
          TradeStone is not a party to any contract between users. We do not verify contractor qualifications or insurance.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
