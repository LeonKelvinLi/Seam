# Clipmelt login entry

The login route existed, but the global header did not mount `NavUser`. Returning customers could reach the studio without finding their account or purchased credits.

## Options considered

- A login modal keeps the home page behind the form but complicates direct links, password reset, and Google return URLs.
- A header link to a dedicated login page gives visitors a predictable entrance and preserves the existing authentication routes. This is the chosen direction.
- A large login block on the home page would compete with the transition examples, so the form stays on its own page.

## Visual direction

Keep the established Clipmelt palette: ink `#0b0b0a`, surface `#141411`, ivory `#ecece2`, muted olive `#96968c`, and lime `#d9fc69`. Use the existing system sans-serif for both expressive headings and controls. No new fonts or decorative animation.

Desktop is a left-aligned pair: real Coffee to Ocean source frames beside a focused login form. Mobile puts the form first and the footage below. The frames explain the product without inventing a user's project or account state.

```text
Clipmelt       Examples   Your footage   Log in   Open studio

Your next cut starts here.      Log in to Clipmelt.
Short workspace explanation    Continue with Google
[Coffee] -> [Ocean]             Email address
See what Clipmelt makes         Password / Forgot password?
                               Log in
                               Create an account
```

After sign-in, the header becomes `Account | 36 credits` using the real account response. Small screens shorten the balance; the account link's accessible name still includes it. Routes and window focus refresh the account state; email login and logout explicitly notify the header. Unknown balance is never rendered as zero.

The dedicated page retains Google and email authentication, safe return destinations, password recovery, and account creation. Labels, keyboard focus, and error announcements make it usable without placeholders or color alone.
