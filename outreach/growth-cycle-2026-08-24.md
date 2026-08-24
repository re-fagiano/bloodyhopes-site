# Organic growth cycle — 24 August 2026

Comparison baseline: 17 August 2026. Search Console figures are cumulative over the property's short available history, while YouTube uses rolling 28-day windows. Percentage changes are therefore directional rather than cohort comparisons.

## Google Search Console

Window shown: 4–22 August 2026 (report set to three months; property history begins on 4 August).

- Clicks: 56, up from 24 (+133%)
- Impressions: 330, up from 75 (+340%)
- CTR: 17%, down from 32% (-15 percentage points) as discovery broadened
- Average position: 13.3, down from 10.3 (-3.0 positions)
- Leading query: `old ironsides song lyrics` — 1 click / 11 impressions
- Leading search pages: `/` 29 / 37; `/about.html` 22 / 26; `/songs/old-ironsides` 2 / 28
- Emerging zero-click pages: `/songs/shiloh-ballad` 0 / 67; `/articles/from-lance-to-repeater` 0 / 56

Interpretation: impressions are expanding much faster than clicks, so the lower aggregate CTR is expected. No single query/page pair has reached the pre-committed 200-impression threshold; title rewrites would still be premature. Redirect-era `/about.html` continues to receive clicks, so retaining its intentional canonical redirect remains preferable to removing it.

## YouTube Studio

Window: 26 July–22 August 2026 (28 days).

- Total views: 4,822 (+80% versus YouTube's preceding period)
- Total watch time: 194.5 hours (+126% versus YouTube's preceding period)
- Net subscribers: +27 (+29% versus YouTube's preceding period)
- Impressions: 59.1K, up from 52.7K (+12.1%)
- CTR: 4.0%, down from 4.3% (-0.3 percentage points)
- Views from impressions: 2.3K, up from 2.2K (+4.5%)
- Average view duration from impressions: 2:26, up from 2:23 (+3 seconds)
- Watch time from impressions: 95.29 hours, up from 89.69 (+6.2%)
- Views by format: 3.9K video (+2.6%); 937 Shorts (+16.0%)
- New viewers: 1.3K video (-13.3%); 232 Shorts (-32.8%)
- Subscribers by format: +24 video; +2 Shorts; overview reports +27 total
- Discovery: 53.2% suggested (-2.5 pp); 16.2% Shorts feed (+1.1 pp); 12.4% playlists (+0.8 pp); 4.5% browse (+0.1 pp)
- Regular viewers: 0 (unchanged)
- Returning-viewer format mix: 86% video only; 14% both; 0% Shorts only

The strongest content signal remains `The Elephant`: 1,776 views and 76.6% average percentage viewed in the window. The newly published `WHITE SHIRTS AT BORODINO` has only 1 view after roughly ten hours; its 0% CTR is not actionable at that sample size, while the 3:27 average view duration is encouraging but equally immature.

Interpretation: recommendation reach, watch time and long-form retention are healthy; discovery of genuinely new viewers and repeat habit remain the strategic constraint. Do not alter the new release or channel packaging from ten hours of data.

## First-party site funnel

Public rolling 30-day directional totals:

- `page_view`: 211, up from 24 (+779%)
- `content_open`: 4, up from 0
- `youtube_click`: 2, up from 0
- `campfire_open`: 128, up from 12 (+967%)
- `voice_submit`: 0 (unchanged)

The new YouTube conversion path has begun recording activity, but two clicks are far below the 20-observation threshold. Event totals are not unique-user cohorts and `campfire_open` can fire independently, so these figures must not be presented as a sequential conversion rate.

## Founding Archive

- Approved public Voices: 8 of 100, up from 5
- Occupancy: 8%
- Remaining founding positions: 92
- Latest approved Voice: #8, Grok 4.5 by xAI on `discipline`

## Decision

No production change in this cycle. The site's new CTA attribution is live and has early signal, but changing it now would reset the experiment. Search result samples remain below the agreed threshold, and the newest YouTube release is too young to diagnose.

Next cycle should specifically test:

- whether `/out/youtube/discipline/*` reaches 20 attributed clicks and which source wins;
- whether `/songs/shiloh-ballad` or `/articles/from-lance-to-repeater` approaches 200 impressions without clicks;
- whether `WHITE SHIRTS AT BORODINO` develops a stable impressions/CTR/retention profile after at least seven days;
- whether the Founding Archive continues to gain external Voices and whether any `voice_submit` event appears.
