# Quota Wallpaper approved design

User approved implementation on 2026-10-12, including source retention for GitHub and Steam Workshop publication.

Web wallpaper is the rendering surface. It supports manual DeepSeek API keys without a collector, offline import, and an optional local collector for DSH/Codex discovery. The collector can run periodically and exit, writing a project-local snapshot, or serve a capability-protected loopback endpoint. No credentials, paths, personal histories or connection tokens enter release archives.

Multiple accounts have independent names, colors, providers, plans and logical group IDs. Keys deduplicate by fingerprint; provider identity or explicit group merges accounts. Same-currency wallets sum after deduplication. Codex percentages are grouped by bucket and window duration, labeled unweighted, with optional user-defined capacity weighting. Missing quota, expired windows and unavailable accounts never become zero consumption or fake available quota.

Clock, date, backgrounds, fit, positioning, scale, palette, transparency, font, modules, chart styles and metrics are configurable. All views adapt to portrait, normal and ultrawide screens. Charts provide 5h, 24h, 7day and 30day horizons for tokens, quota change and estimated wallet spend, layered by account. Coverage and unavailable data are explicit. Local Codex/DSH token records are incrementally indexed without storing conversation content; wallet changes are estimates with recharge/reset boundaries identified.

Low-resource rendering has no continuous animation or canvas loop; SVG charts redraw only on changes and clock ticks can be minute-based. Collection defaults to 300 seconds, with timeout, backoff and last-good values. Local histories keep 30 days and are bounded. Source, lockfile, MIT license, bilingual introduction, release scripts, publishing instructions and sanitized demo data are included.

Platform: Windows primary, Node >=20 collector, bundled vanilla JavaScript frontend, no frontend network libraries or CDN. Provider requests only target fixed official HTTPS hosts. Codex API keys do not represent ChatGPT subscription limits. Additional subscription accounts require separate existing Codex homes, not changes to the active login.
