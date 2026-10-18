import { Figtree, IBM_Plex_Mono } from "next/font/google";

import "../workspace.css";
import "./explorer.css";

const workspaceSans = Figtree({
  subsets: ["latin"],
  variable: "--font-workspace-sans",
  display: "swap",
});

const workspaceMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-workspace-mono",
  display: "swap",
});

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`workspace-root ${workspaceSans.variable} ${workspaceMono.variable}`}>{children}</div>
  );
}
