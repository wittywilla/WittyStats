<h1 align="center">WittyStats</h1>

<p align="center">
  <b>A statistics screen for WittyMediaServer that you arrange yourself.</b><br>
  The machine, who is playing what, your libraries and their history, as charts or tables, on every device.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence: Apache-2.0" src="https://img.shields.io/badge/licence-Apache--2.0-blue.svg"></a>
</p>

<p align="center">
  <a href="#what-it-shows">What it shows</a> ·
  <a href="#how-the-layouts-work">Layouts</a> ·
  <a href="#every-device">Every device</a> ·
  <a href="#what-it-costs">What it costs</a> ·
  <a href="#how-its-built">How it's built</a>
</p>

> WittyStats is developed and released here. Issues and pull requests are welcome.

It's the screen only. The numbers belong to [WittyMediaServer](https://github.com/wittywilla/WittyMediaServer), which collects them, decides who may see what, and works just the same without this module. The server's guide to them is `docs/STATS.md`.

## What it shows

| Group | Widgets |
|---|---|
| **Machine** | Processor, processor cores, temperature, memory, swap, graphics and encoder sessions, disk space, disk speed and how busy, network per connection |
| **This server** | The program itself (processor, memory, heap, goroutines, threads, handles, memory clean-ups), uptime, modules and updates, background work, database, caches, warnings and errors |
| **Playing now** | Who is playing what on which device, whether it's direct, remuxed or transcoded and why, its rate, picture size and where it's from; how much converting is going on; game sessions with frame rate and encoding time |
| **Libraries** | Items and sizes by library and type, video formats, picture sizes, duplicates and possible savings, scan times |
| **History** | Most watched, data by person, the busiest moment, playing over time |

- **What a server can't provide says why.** The server's catalogue says what's available here, and a widget that can't show anything says "Not available here" with the reason. It's never drawn as a zero.
- **Estimates say they are.** Duplicates and possible savings carry an Estimate mark, on the card, in the table and in the export.
- **Encoding time is labelled** as the server's part of a game's delay. The network's part is known only to the player.
- **Someone who isn't an administrator** sees only what the server allows them: their own streams and game sessions, the libraries they can see, what they've watched. There's no empty frame for the rest, and every preset still works. If the owner hasn't let them look at all, it says so plainly.

Every widget has a **switch to a table**, and one switch does them all. Tables are real tables, with captions and headings. Charts have a summary in words as their name, and nothing depends on colour alone: line ends have different shapes, legends and values sit beside the marks, and warnings have an icon and a word.

**Details** opens any widget to more series and every row, with **CSV and JSON** of what's shown. The files are made in the browser from what it already holds. A CSV cell that a spreadsheet would run as a formula gets a quote in front of it, as a title on a media server is anyone's to choose. Numbers stay raw with their unit in the heading, and times are ISO dates.

## How the layouts work

Choose **Customise**. Each widget gets buttons to move it earlier or later, make it wider, narrower, taller or shorter, and remove it, and each change is read out to a screen reader. With a mouse or finger you can also drag its handle and its corner. There's an **Undo**.

- **Up to eight layouts** per person: create (a copy of what's on screen), rename, delete, and switch between them.
- **Presets:** Simple, Standard and Advanced replace what's on the layout on screen. Undo brings it back.
- **Reset to stock** asks first, then goes back to one layout with the Standard preset.
- **The grid** has four columns on a wide screen, two on a medium one, and one on a phone. A widget is 1 to 4 wide and 1 to 3 tall, and asks for no more than the screen has.

Layouts are saved per person through the host's small store, in under 10 KB even when full: a widget is one short string such as `cpu:2:1`. What comes back from the store is never trusted. Damaged data gives stock, and widgets it doesn't know are dropped (`src/layout.ts`, with tests).

## Every device

- **Phone:** one column, a 16px gutter, no sideways scrolling, and 44px touch targets. Wide tables stack up, row by row.
- **TV and controller:** arrows reach everything, as everything is a real button. Charts don't hold on to the arrows there, focus always shows, a button with only an icon says what it does when focus reaches it, and everything grows to read from the sofa.
- **Keyboard:** Tab reaches everything, and on a chart the left and right arrows walk along the readings. Dialogs hold the focus, Escape closes them, and focus goes back where it came from.
- **Reduced motion** is respected: only the "waiting" dot moves at all, and it stops.

Colours come from the theme. Series 1 is the theme's accent, and the others turn its hue at a fixed lightness, chosen by running every combination through a colour-blindness check on all the built-in themes.

## What it costs

Nothing until the page opens. Then:

- **One stream**, asking only for the sections of widgets on the layout, and only while the page is showing and not paused. It closes when the page is hidden or left, and reconnects with a growing wait. It's what keeps the server's sampler going, so this matters.
- **The report and histories** are fetched only when a widget that needs them is near the screen, each no more than once a minute.
- **No polling** for live numbers. **No chart library:** charts are a few hundred lines of SVG and CSS.
- **A few widgets per frame:** new readings are drawn a few widgets at a time, and not at all for widgets scrolled away, so a cheap TV keeps a steady picture. A pointer moving over a chart writes to the page directly, with no render.

## How it's built

A page gets one prop, `host`, and needs nothing else from the app:

```ts
type Host = {
  request(method: string, path: string, body?: unknown): Promise<unknown> // the server's API, with the viewer's own access
  user: { admin: boolean }
  store: { get(key: string): unknown; set(key: string, value: unknown): unknown } // a small JSON store per account
  token?: () => string // for the stream: a bearer token, if there is one
  base?: () => string  // for the stream: the server's address, if it isn't the page's own
}
export const pages = { stats: StatsPage }
```

Without `token` and `base`, the stream is opened on the page's own address with its cookies.

```
src/widgets.ts    every widget: what it needs and what can have it; the presets
src/layout.ts     layouts as plain data: add, move, resize, presets, reading what's stored
src/views.ts      what each widget shows, as plain data: chart, table, words and exports all come from this
src/store.ts      what's been received, and the rules for how little to ask for
src/frames.ts     reads server-sent events by fetch
src/exports.ts    CSV and JSON
src/format.ts     numbers for people
src/charts.tsx    the charts and tables
src/Widget.tsx, StatsPage.tsx, Detail.tsx, Customise.tsx, parts.tsx, stats.css    the screen
```

## Tests

```bash
npm test               # layouts, stored data, every widget's view, CSV, number formats, reading the stream
npm run build:bundle   # one script and one stylesheet, as a server installs it
```

## Licence

**Apache-2.0**, the same licence as WittyMediaServer. © 2026 WittyWilla and contributors.
Use, change and share it; if you redistribute it or build on it, keep the [NOTICE](NOTICE)
attribution, *“WittyStats, developed by WittyWilla”*, in your NOTICE file, documentation or About screen.

## Legal

WittyStats is an independent open-source project. It isn't associated with, sponsored by or endorsed by any maker of operating
systems, graphics cards or other media software whose numbers it may show. It holds no media and sends nothing anywhere: everything it
shows comes from your own server. Figures marked as estimates are only that, so check before acting on them. Any third-party names
here only describe what it works with, and belong to their owners. It's provided “as is”, with no warranty; see [LICENSE](LICENSE).
Local law applies to how you use it. This isn't legal advice.

<!-- module-kit -->
## Releasing

A version tag builds the bundle for the browser, signs the checksum list, and publishes a release that servers can install.

Versions move in small steps as work lands. `go run github.com/wittywilla/wittymodule/cmd/wittymodule@v0.2.1 bump .` raises it
everywhere it is written (add `-part minor` for a bigger step). A bump isn't a release: nothing is
tagged or published until you tag it. CI fails when code changed since the last tag and the version
didn't, because tags never move.

To release:

1. Check that `version` in `module.json` is the one to publish, with the bump committed.
2. Tag that commit and push the tag: `git tag vX.Y.Z`, then `git push origin vX.Y.Z`. A tag with a
   suffix, such as `v1.2.0-beta`, is published as a prerelease.
3. Watch the *Actions* tab. The signing step uses the `WMS_SIGNING_KEY` secret of the `release` environment, and nothing is published without it.

To take a version back, run the *withdraw* workflow from the *Actions* tab. It adds the version to a signed list on the release tagged `withdrawals`, which servers read.

Licensed under Apache-2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE).
<!-- /module-kit -->
