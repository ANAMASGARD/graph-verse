"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClerkAuthControls } from "./clerk-auth-controls";
import { LandingGetStarted } from "./landing-get-started";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_112712_da9d53df-6d27-4b12-bdf6-aa9dc2622bdf.mp4";

function BrandMark() {
  return (
    <svg viewBox="0 0 31.5 48.5" aria-hidden="true">
      <defs>
        <linearGradient id="bg1" x1="8" y1="0" x2="34.1" y2="28.9" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9e9e9e" />
          <stop offset="0.28" stopColor="#a6a6a6" />
          <stop offset="0.34" stopColor="#a3a3a3" />
          <stop offset="0.4" stopColor="#3a3a3a" />
          <stop offset="0.55" stopColor="#414141" />
          <stop offset="0.6" stopColor="#7a7a7a" />
          <stop offset="0.68" stopColor="#8e8e8e" />
          <stop offset="0.8" stopColor="#a9a9a9" />
          <stop offset="0.95" stopColor="#c4c4c4" />
          <stop offset="1" stopColor="#cccccc" />
        </linearGradient>
      </defs>
      <path
        d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z"
        fill="url(#bg1)"
      />
      <rect x="0.5" y="18.5" width="9" height="10" fill="#fdfdfd" />
      <rect x="22" y="19.5" width="9.5" height="9.5" fill="#fdfdfd" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "#about", label: "About" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
] as const;

export function CinematicLanding() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => !open);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenu]);

  useEffect(() => {
    const onResize = () => {
      const wide = window.innerWidth / window.innerHeight > 1.1;
      if (wide) {
        closeMenu();
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [closeMenu]);

  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="cinematic-root">
      <div
        ref={stageRef}
        className={`stage${menuOpen ? " is-open" : ""}`}
      >
        <div className="plate">
          <video
            className="plate-video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        </div>

        <header className="topbar">
          <a className="brand" href="/" aria-label="Home">
            <BrandMark />
          </a>
          <ul className="links" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
          <ClerkAuthControls variant="topbar" />
          <button
            type="button"
            className="burger"
            id="burger"
            aria-expanded={menuOpen}
            aria-controls="menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={toggleMenu}
          >
            <i aria-hidden="true" />
            <i aria-hidden="true" />
          </button>
        </header>

        <nav
          className="menu"
          id="menu"
          aria-hidden={!menuOpen}
          aria-label="Mobile"
        >
          <div className="menu-inner">
            <p className="menu-eyebrow">Menu</p>
            <ul className="menu-list">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a href={item.href} onClick={closeMenu}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="menu-foot">
              <ClerkAuthControls variant="menu" />
              <a className="ghost" href="#architecture" onClick={closeMenu}>
                View Architecture
              </a>
            </div>
          </div>
        </nav>

        <main className="hero">
          <h1 className="headline">
            <span>The Next Layer</span>
            <span>of Intelligence</span>
          </h1>
          <p className="sub">
            <span>
              A unified infrastructure platform to help teams build,
            </span>
            <span>
              ship, and scale AI systems with confidence.
            </span>
          </p>
          <div className="actions">
            <LandingGetStarted />
            <a className="ghost" href="#architecture" id="architecture">
              View Architecture
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
