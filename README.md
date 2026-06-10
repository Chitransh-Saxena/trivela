# trivela ⚽

A tiny free-kick game that makes the **Magnus effect** impossible to
misunderstand: bend the ball around the wall into the top corner, and you've
*felt* why spin curves a ball. Vanilla JS, `<canvas>`, **no dependencies, no
build step**.

> Sibling of [`deadlock-dinner`](https://deadlock-dinner.pulsar-projects.org/) —
> part of the [mainframe arcade](https://chitransh.pulsar-projects.org/#arcade).

**Play:** move to aim · `◀ / ▶` curl · hold `SPACE` for power · release to
strike · `?` reveals the physics. Beat the keeper in the top corner — he can't
reach up there. Turn off the trainer line for bonus points.

## It's a Web Component

The whole game is one custom element. Drop it on any page:

```html
<script src="physics.js"></script>
<script src="trivela-game.js"></script>
<trivela-game></trivela-game>
```

It renders in **shadow DOM** (style-isolated) and inherits its theme from the
host's CSS custom properties — `--blood`, `--glow-rgb`, `--ink`, fonts — so it
matches whatever it's embedded in, including live theme switching. With no host
vars it falls back to the blood-red CRT palette.

That's how it embeds, same-origin, on the private portfolio's landing page while
this repo stays public.

## Layout

```
public/
  index.html        # standalone "free-kick lab" shell
  styles.css        # standalone shell theme (tokens mirror the mainframe)
  physics.js        # pure ball-flight sim (Magnus curl) — runs in browser & Node
  trivela-game.js   # the <trivela-game> custom element (canvas, input, HUD, ELI5)
test/
  physics.test.js   # Node smoke tests for the sim (no deps)
wrangler.jsonc      # assets-only Cloudflare Worker
```

## Develop

```bash
npm test              # node test/physics.test.js — physics smoke tests
npx wrangler dev      # local preview at http://localhost:8787
npx wrangler deploy   # ship public/ (main Cloudflare account)
```

The physics is a pure module so the core (does the ball actually curl? does the
wall block it?) is unit-tested without a browser.

## License

MIT © Chitransh Saxena. Designed & built with Claude Code.
