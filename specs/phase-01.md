# Phase 1 — Auth and teams

**Goal.** Someone signs in, belongs to a team, and lands somewhere that belongs
to that team, in the theme they prefer.

Sign-in itself is already scaffolded. This phase is about what has to be true
around it.

## Build

- **Organizations.** Signing in for the first time lands the person inside one
  without being asked to create it. There's a way to switch between them, and a
  way to invite someone else into one. Accepting an invitation brings the person
  to this app's login page.
- **The current organization is readable during server rendering**, not only in
  the browser.
- Whichever sign-in methods are enabled all lead to the same place. Adding or
  removing one is configuration, not a code change.
- Signed-out visitors to a protected route get sent to the login screen before
  anything renders.
- A theme control with three states: follow the system, force light, force
  dark. Written to the root element so the colour tokens key off it.
- The application shell everything later renders inside.

## Constraints

- **Identity is a token, and the token carries the organization.** Everything
  built after this decides what someone can see by reading that claim. Nothing
  downstream should ever have to ask the identity provider a question at
  runtime.
- Use what the sign-in scaffolding already provides rather than rebuilding it.
  If a hand-written login form appears in this phase, something has gone wrong.
- **One session system, not two.** Sessions belong to the identity provider only.
  Nothing else installs its own auth middleware or session cookies alongside
  Clerk. Two things trying to own the same cookie and the same middleware slot
  is a bug that presents as random sign-outs.
- **FalkorDB is server-only.** A single shared connection factory is constructed
  at startup from environment variables (host, port, and credentials when
  present). It does not select a graph yet — that happens once queries exist,
  using the org id from the token. The browser never talks to FalkorDB.
- Environment configuration fails loudly at startup if FalkorDB settings are
  missing. A blank value that produces a confusing error three screens later is
  worse than a crash on boot.
- Nothing here creates graph schema or seed data.

## Acceptance check

1. Sign in on a brand new account with each method that's enabled. They all land
   in the same place, and the account is already inside an organization without
   having been asked to make one.
2. Invite a second account. Accepting the invitation arrives at the login page,
   and signing in from there lands in that organization's workspace.
3. Read the current organization in a server component and render it. It's there
   on the first paint, not after a client-side hydration.
4. Switch the theme, reload, the choice is still there. All three states work,
   and forcing light while the system is dark actually wins.
5. Visit a protected route while signed out, get redirected to login. Confirm in
   the network tab that the page's HTML was never sent.

## Not in this phase

Any FalkorDB nodes or relationships. Roles beyond the defaults that come out of
the box. Styling the sign-in screen beyond making it match the rest of the app.
