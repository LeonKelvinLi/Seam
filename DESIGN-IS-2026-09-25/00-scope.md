# Scope
Redesign Clipmelt's public homepage, global navigation, and core studio/login/pricing presentation. The first-time visitor must understand that AI generates the transition connecting two supplied clips. Preserve Clipmelt identity, real proof videos, existing upload/generation/auth/payment contracts and attribution. User explicitly requests extensive 3D and scroll animation. Chrome extension is the only browser surface. Worktree: /Users/leon/Desktop/dev/Seam-redesign.

# Design plan
Palette: deep ink #090b13, slate #141827, paper #f3f4f8, muted silver #a6adbf, iris #bbadff, mint #d9fc69 (source-footage signal only).
Type: Space Grotesk for dimensional headings; DM Sans for controls and readable copy. Sentence case throughout.
Layout: broad centered title, an asymmetric 3D footage assembly under it, then an immersive scroll-controlled transition, light process panel, editorial example reel, practical answers and final CTA. Header always exposes examples, pricing, login/account and create.

    [Clipmelt]    Examples   How it works   Pricing    Log in   Create
                 AI transitions between your clips.
                 explanation / primary action / sample
        [source A]    [AI transition / finished film]    [source B]
        ================== timeline ==================
    [sticky, scroll-controlled film and source/AI/source playhead]
    [how it works: input -> choose -> generate, spatial demonstration]
    [interactive example gallery]    [FAQ]    [start free]

Motion: perspective transforms and cursor parallax on footage assembly; scroll changes depth, angle and spacing; real film scrubbing; stacked cards unfold in the process section; gallery has pointer-responsive tilt; a single ambient halo ties the AI bridge together. Each animation must support source -> bridge -> destination comprehension. Reduced motion and the page motion control show a static, usable layout. Avoid scroll hijacking, pointer-only actions and decorative particle overload.

Plan critique: generic floating gradient shapes would obscure the product. Use actual video frames and a labeled timeline as the 3D objects; the memorable scene is an exploded edit rather than an abstract orb. The requested rich motion overrides the audit skill's general preference against autoplay, while offscreen pausing/reduced-motion protections remain required.
