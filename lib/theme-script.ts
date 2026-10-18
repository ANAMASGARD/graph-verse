import { THEME_COOKIE } from "@/lib/theme";

/** Runs before paint so system/light/dark match stored preference. */
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_COOKIE)};var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));var t=m?decodeURIComponent(m[1]):"dark";var r=document.documentElement;if(t==="dark"){r.classList.add("dark");return}if(t==="light"){r.classList.remove("dark");return}if(window.matchMedia("(prefers-color-scheme: dark)").matches){r.classList.add("dark")}else{r.classList.remove("dark")}}catch(e){}})();`;
