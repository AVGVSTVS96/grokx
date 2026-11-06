# grokx

Free X (Twitter) reads for any agent, through Grok Bot's built-in X tools. No X API key, no X API credits.

```sh
grokx ask "the 5 newest posts mentioning t3 code, with likes and views"
```

```json
{
  "ok": true,
  "data": {
    "posts": [
      {
        "id": "…",
        "author": { "username": "…" },
        "text": "…",
        "public_metrics": { "like_count": 431 }
      }
    ]
  }
}
```

## How it works

```
your agent ──grokx ask──▶ Grok Bot backend ──▶ "X Reader" bot
                                                  │ built-in x tools (free)
your agent ◀──JSON──────── transcript ◀──────────┘
```

Every Grok Bot has a built-in `x` toolset that reads X without the X API billing you. grokx keeps one bot on your account, "X Reader", whose only job is to answer X questions with those tools and reply in JSON. `grokx ask` sends it your question, waits for its reply and prints it.

## Setup

You need a Grok Bot account and Node 23.6+ (or Bun).

```sh
git clone https://github.com/AVGVSTVS96/grokx && cd grokx && bun install
alias grokx="node $PWD/src/grokx.ts"

grokx login    # prints a link: open it where you're signed in to Grok Bot and confirm
grokx setup    # creates the X Reader bot (or: grokx setup --bot <id> to use one you have)
```

Credentials stay in `~/.config/grokx` (or `$GROKX_HOME`).

## Commands

| Command                  | What it does                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `grokx ask "<request>"`  | Asks the bot anything about X and prints `{ ok, data }`. Waits up to 300 s (`--timeout`). |
| `grokx login`            | Signs in to Grok Bot. Tokens refresh on their own.                                        |
| `grokx setup [--bot id]` | Creates the X Reader bot, or points grokx at one of yours.                                |
| `grokx bots`             | Lists your bots.                                                                          |

If the bot's reply isn't valid JSON, `ask` prints `{ "ok": true, "raw": "<its reply>" }`.

## What it can read

Full-archive post search, posts by id, anyone's timeline, mentions, quotes, reposts, user lookups, news and trends. The tools report limits of 30 calls a minute and 1000 a day per account. An ask takes about 20 to 40 seconds, and a bot answers one ask at a time.

Writing (posting, liking, DMs) isn't part of the free tools. Grok Bot's X plugin can do it, but it bills your X developer account, so X Reader is told to leave it alone.

## Caveats

grokx talks to the backend the Grok Bot app uses. It isn't a published API, so an app update can break it.

## License

MIT
