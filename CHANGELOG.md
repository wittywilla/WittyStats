# Changelog

What changed in WittyStats, newest first.

## Unreleased

- Carries `sdui.json` with its theme scope. Its Statistics page stays a page of its web bundle, on the web and desktop apps.
- **WittyStats 0.2.0:** Fits WittyMediaServer 0.8.x.

- A **Help** link at the top of the page opens the Server statistics guide, and the page says where the owner chooses who may look.
- The workflows use WittyModule 0.3.0, as the other modules do.

## 0.1.1

- The disk space widget says what each drive reports about its own health, where the system will say.

## 0.1.0

The first version: the statistics screen for WittyMediaServer 0.6.0-alpha.

- **29 widgets:** the processor overall and per core, temperature, memory, swap, graphics and encoder sessions, disk space,
  disk speed, network per connection, the server program itself, uptime, modules and updates, background work, who is playing what
  and how, converting, game sessions, libraries, video formats, picture sizes, duplicates and possible savings (marked as
  estimates), scan times, the database, caches, warnings and errors, most watched, data by person, the busiest moment, and playing
  over time.
- **Arrange it yourself:** add, remove, move and resize widgets, with buttons from a keyboard or remote, and by dragging with a
  mouse or finger. Up to eight saved layouts per person, three presets (Simple, Standard, Advanced), undo, and reset to stock.
- **Charts and tables:** every widget has a real table as well, one at a time or all at once. Charts have a summary in words.
- **Details:** each widget opens to more series, every row, and CSV and JSON exports made in the browser.
- **Every device:** phones, tablets, desktops and TV remotes, in any theme.
- **Costs little:** live numbers come on one stream, only while the page is showing and only for widgets on the layout. Nothing is
  polled. Widgets that are scrolled away aren't redrawn or fetched for.
