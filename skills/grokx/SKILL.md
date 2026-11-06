---
name: grokx
description: Read X (Twitter) for free through Grok Bot's built-in X tools with the grokx CLI. Use when a task needs posts, timelines, search results, mentions, quotes, user profiles, news or trends from X and there's no paid X API to spend on.
---

# grokx

`grokx ask "<request>"` sends a plain-English X question to a Grok bot on the user's account and prints its answer as JSON. The bot reads X with Grok Bot's free built-in tools, so nothing bills the X API.

```sh
grokx ask "search the last 24h for posts about bun 2.0, top 10 by likes"
grokx ask "the 20 newest posts by @someone, including replies"
grokx ask "who quoted https://x.com/someone/status/123, with their follower counts"
grokx ask "user profile and follower count for @someone"
```

Say exactly what you want back: the time window, how many, the sort, and which fields (ids, urls, text, metrics). The answer is `{ "ok": true, "data": … }`, `{ "ok": false, "error": … }`, or `{ "ok": true, "raw": "…" }` when the bot's reply wasn't valid JSON, in which case read `raw` as its answer.

An ask takes 20 to 40 seconds and the bot handles one at a time, so batch related questions into one ask. The limits are 30 calls a minute and 1000 a day.

It only reads. Posting, liking and DMs aren't available through it.

If `grokx` says it isn't signed in or has no bot, run `grokx login` (it prints a link the user opens and confirms) and then `grokx setup`.
