
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

const navigation = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Docs", href: "/docs" },
];

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="vetto-navbar">
      <nav
        className="vetto-navbar__inner container-main"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="vetto-navbar__brand"
          aria-label="VETTO home"
          onClick={closeMenu}
        >
          <span className="vetto-navbar__brand-mark" aria-hidden="true">
            V
          </span>

          <span className="vetto-navbar__brand-name">VETTO</span>
        </Link>

        <div className="vetto-navbar__desktop">
          <div className="vetto-navbar__links">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="vetto-navbar__link"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="vetto-navbar__right">
            <div className="vetto-navbar__network">
              <span className="vetto-navbar__network-dot" />
              <span>Robinhood Chain</span>
            </div>

            <Link
              href="/app"
              className="vetto-navbar__launch"
            >
              Launch App
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>

        <button
          type="button"
          className="vetto-navbar__menu-toggle"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
          aria-controls="vetto-mobile-navigation"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>

      <div
        id="vetto-mobile-navigation"
        className={[
          "vetto-navbar__mobile",
          isMenuOpen ? "vetto-navbar__mobile--open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={!isMenuOpen}
      >
        <div className="vetto-navbar__mobile-links">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="vetto-navbar__mobile-link"
              tabIndex={isMenuOpen ? 0 : -1}
              onClick={closeMenu}
            >
              {item.label}
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>

        <div className="vetto-navbar__mobile-network">
          <span className="vetto-navbar__network-dot" />
          <span>Connected to Robinhood Chain</span>
        </div>

        <Link
          href="/app"
          className="vetto-navbar__mobile-launch"
          tabIndex={isMenuOpen ? 0 : -1}
          onClick={closeMenu}
        >
          Launch VETTO App
          <ArrowUpRight size={16} />
        </Link>

        <div className="vetto-navbar__mobile-note">
          <ShieldCheck size={14} />
          <span>Your wallet. Your approval. Your control.</span>
        </div>
      </div>
    </header>
  );
}
