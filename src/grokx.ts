#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Effect, Option, Schema } from "effect";

const BACKEND = "https://api2.cursor.sh";
const CLIENT_ID = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";
const HOME = process.env.GROKX_HOME ?? path.join(homedir(), ".config", "grokx");
const AUTH_FILE = path.join(HOME, "auth.json");
const BOT_FILE = path.join(HOME, "bot.json");

const BOT_NAME = "X Reader";

const BOT_DESCRIPTION =
  'Answers X (Twitter) read requests sent by scripts and other agents. For each request, get what it asks with the built-in x tools, then send one final message containing only a JSON object: {"ok": true, "data": ...} with the results, or {"ok": false, "error": "..."} when it cannot be done. Keep post ids, author handles, timestamps, metrics and full text. Use the built-in x tools only, because the user-X plugin bills the owner\'s X API credits.';

const listOf = <S extends Schema.Top>(item: S) =>
  Schema.Array(item).pipe(Schema.withDecodingDefault(Effect.succeed([])));

const Tokens = Schema.Struct({ accessToken: Schema.String, refreshToken: Schema.String });
const Refreshed = Schema.Struct({ access_token: Schema.String });
const Bot = Schema.Struct({ agentId: Schema.String });

const Agents = Schema.Struct({
  agents: listOf(Schema.Struct({ agentId: Schema.String, name: Schema.String })),
});

const Entries = Schema.Struct({
  entries: listOf(
    Schema.Struct({
      body: Schema.optionalKey(Schema.String),
      entryKind: Schema.String,
      seq: Schema.String,
    }),
  ),
});

const EntryBody = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({ message: Schema.Struct({ content: Schema.String }) }),
    Schema.Struct({ content: Schema.String }),
  ]),
);

const Statuses = Schema.Struct({
  statuses: listOf(Schema.Struct({ isRunning: Schema.optionalKey(Schema.Boolean) })),
});

const Ignored = Schema.Unknown;

const Answer = Schema.Struct({
  data: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.String),
  ok: Schema.Boolean,
  raw: Schema.optionalKey(Schema.String),
});

interface Reply {
  seq: number;
  kind: string;
  text: string;
}

type RpcRequest =
  | { agentIds: string[] }
  | { agentId: string; limit: number }
  | {
      agentId: string;
      messageId: string;
      sentAtMs: string;
      sessionId: string;
      source: string;
      text: string;
    }
  | {
      agentId: string;
      legacyAgentId: string;
      name: string;
      description: string;
      [enumField: string]: string | boolean;
    }
  | { includeTeamAgents: boolean };

const readStored = async <S extends Schema.Top & Schema.Decoder<unknown>>(
  file: string,
  schema: S,
) => {
  const raw = await readFile(file, "utf-8").catch(() => "");

  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(schema))(raw));
};

const store = async (file: string, value: typeof Tokens.Type | typeof Bot.Type) => {
  await mkdir(HOME, { mode: 0o700, recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

const refreshed = async (tokens: typeof Tokens.Type): Promise<typeof Tokens.Type> => {
  const response = await fetch(`${BACKEND}/oauth/token`, {
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`token refresh failed (${response.status}): run grokx login`);
  }

  const { access_token: accessToken } = Schema.decodeUnknownSync(Refreshed)(await response.json());
  const next = { accessToken, refreshToken: tokens.refreshToken };

  await store(AUTH_FILE, next);

  return next;
};

const rpc = async <S extends Schema.Top & Schema.Decoder<unknown>>(
  method: string,
  request: RpcRequest,
  schema: S,
): Promise<S["Type"]> => {
  const tokens = await readStored(AUTH_FILE, Tokens);

  if (tokens === undefined) {
    throw new Error("not signed in: run grokx login");
  }

  const send = async ({ accessToken }: typeof Tokens.Type) =>
    await fetch(`${BACKEND}/aiserver.v1.GrokBotService/${method}`, {
      body: JSON.stringify(request),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      method: "POST",
    });

  let response = await send(tokens);

  if (response.status === 401) {
    response = await send(await refreshed(tokens));
  }

  if (!response.ok) {
    throw new Error(`${method} failed (${response.status}): ${await response.text()}`);
  }

  return Schema.decodeUnknownSync(schema)(await response.json());
};

const login = async () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const uuid = randomUUID();
  const url = `https://cursor.com/loginDeepControl?challenge=${challenge}&uuid=${uuid}&mode=login&redirectTarget=cli`;

  console.error(`Open this link in a browser signed in to Grok Bot, and confirm:\n${url}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${BACKEND}/auth/poll?uuid=${uuid}&verifier=${verifier}`);
    const body: unknown = response.ok ? await response.json() : null;
    const tokens = Option.getOrUndefined(Schema.decodeUnknownOption(Tokens)(body));

    if (tokens !== undefined) {
      await store(AUTH_FILE, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      console.error("Signed in.");

      return;
    }

    await sleep(3000);
  }

  throw new Error("sign-in timed out");
};

const setup = async (existing: string | undefined) => {
  const agentId = existing ?? randomUUID();

  if (existing === undefined) {
    await rpc(
      "CreateGrokBotAgent",
      {
        agentId,
        createCaller: "GROK_BOT_AGENT_CREATE_CALLER_PRODUCT_CREATE",
        createIntent: "GROK_BOT_AGENT_CREATE_INTENT_FRESH",
        description: BOT_DESCRIPTION,
        harness: "GROK_BOT_AGENT_HARNESS_KIND_TEMPORAL",
        introductionSuppressed: true,
        legacyAgentId: agentId,
        name: BOT_NAME,
      },
      Ignored,
    );
  }

  await store(BOT_FILE, { agentId });
  console.error(
    existing === undefined ? `Created bot "${BOT_NAME}" (${agentId}).` : `Using bot ${agentId}.`,
  );
};

const bots = async () => {
  const { agents } = await rpc("ListGrokBotAgents", { includeTeamAgents: false }, Agents);

  for (const agent of agents) {
    console.log(`${agent.agentId}\t${agent.name}`);
  }
};

const replyText = (base64: string | undefined) => {
  const json = Buffer.from(base64 ?? "", "base64").toString("utf-8");
  const body = Option.getOrUndefined(Schema.decodeUnknownOption(EntryBody)(json));

  if (body === undefined) {
    return "";
  }

  return "message" in body ? body.message.content : body.content;
};

const transcript = async (agentId: string, limit: number): Promise<Reply[]> => {
  const { entries } = await rpc("ListGrokBotTranscriptEntries", { agentId, limit }, Entries);

  return entries.map((entry) => ({
    kind: entry.entryKind,
    seq: Number(entry.seq),
    text: replyText(entry.body),
  }));
};

const CONTROL_ESCAPES = new Map([
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
]);

const escapeControlsInStrings = (json: string) => {
  let inString = false;
  let escaped = false;
  let out = "";

  for (const char of json) {
    const replacement = inString && !escaped ? CONTROL_ESCAPES.get(char) : undefined;

    if (replacement !== undefined) {
      out += replacement;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
    }

    escaped = char === "\\" && !escaped;
    out += char;
  }

  return out;
};

const parseAnswer = (reply: string) => {
  const json = escapeControlsInStrings(reply.trim().replaceAll(/^```(?:json)?\s*|\s*```$/gu, ""));

  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Answer))(json));
};

const isRunning = async (agentId: string) => {
  const { statuses } = await rpc("ListGrokBotAgentStatuses", { agentIds: [agentId] }, Statuses);

  return statuses.some((status) => status.isRunning === true);
};

const ask = async (request: string, timeoutSeconds: number): Promise<typeof Answer.Type> => {
  const bot = await readStored(BOT_FILE, Bot);

  if (bot === undefined) {
    throw new Error("no bot yet: run grokx setup");
  }

  const { agentId } = bot;
  const before = await transcript(agentId, 1);
  const baseline = Math.max(0, ...before.map((entry) => entry.seq));

  await rpc(
    "SendGrokBotUserMessage",
    {
      agentId,
      messageId: randomUUID(),
      sentAtMs: String(Date.now()),
      sessionId: "",
      source: "GROK_BOT_SEND_SOURCE_CHAT",
      text: `${request}\n\nReply with only the JSON object.`,
    },
    Ignored,
  );

  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(4000);

    const latest = await transcript(agentId, 30);
    const replies = latest.filter((entry) => entry.seq > baseline && entry.kind === "send-message");

    const answer = replies
      .map((entry) => parseAnswer(entry.text))
      .find((parsed) => parsed !== undefined);

    if (answer !== undefined) {
      return answer;
    }

    if (replies.length > 0 && !(await isRunning(agentId))) {
      return { ok: true, raw: replies.map((entry) => entry.text).join("\n\n") };
    }
  }

  return { error: `no answer within ${timeoutSeconds}s`, ok: false };
};

const USAGE = `grokx: X reads through Grok Bot's built-in x tools

  grokx login              sign in to your Grok Bot account
  grokx setup [--bot id]   create the "X Reader" bot, or use one you have
  grokx ask "<request>"    ask for anything on X, print the JSON answer
  grokx bots               list your bots

  --timeout <seconds>      how long ask waits (default 300)`;

const takeFlag = (args: string[], name: string) => {
  const index = args.indexOf(name);

  return index === -1 ? undefined : args.splice(index, 2)[1];
};

const main = async ([command = "", ...rest]: string[]) => {
  if (command === "login") {
    await login();
  } else if (command === "setup") {
    await setup(takeFlag(rest, "--bot"));
  } else if (command === "bots") {
    await bots();
  } else if (command === "ask") {
    const timeout = Number(takeFlag(rest, "--timeout") ?? "300");
    const answer = await ask(rest.join(" "), timeout);

    console.log(JSON.stringify(answer, null, 2));
    process.exitCode = answer.ok ? 0 : 1;
  } else {
    console.error(USAGE);
    process.exitCode = command === "" ? 0 : 1;
  }
};

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
