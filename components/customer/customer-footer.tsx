import Link from "next/link";
import Image from "next/image";

export function CustomerFooter() {
  return (
    <footer className="courista-footer" role="contentinfo" aria-label="Courista information and legal">
      <div className="courista-footer-inner">
        <nav className="courista-footer-links" aria-label="Legal and information">
          <Link href="/terms" className="courista-footer-link">
            Terms &amp; Conditions
          </Link>
          <span className="courista-footer-sep" aria-hidden="true">·</span>
          <Link href="/disclaimer" className="courista-footer-link">
            Disclaimer
          </Link>
          <span className="courista-footer-sep" aria-hidden="true">·</span>
          <Link href="/privacy-policy" className="courista-footer-link">
            Privacy Policy
          </Link>
        </nav>
        <div className="courista-footer-dev">
          <span className="courista-footer-dev-text">Made with care by Us Developers </span>
          <span className="courista-dev-mark" title="Developer Mark" aria-label="Developer logo">
            <Image
              src="/courista/developer-mark.svg"
              alt=""
              width={18}
              height={18}
              className="inline-block"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </footer>
  );
}
