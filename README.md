# Agent Skills

Reusable skills for AI agents, authored and maintained by [DXVSI](https://github.com/DXVSI). Instructions and supporting materials are written in English. Skills follow the user's requested language when producing content.

## Available skills

- [natural-writing](skills/natural-writing/SKILL.md): write clear, natural prose while preserving facts, uncertainty, citations, and the requested format. Covers replies and reports to the user, voice-mode answers, and message drafts sent on the user's behalf. Includes worked editing and conversation examples.
- [telegram-web-devtools](skills/telegram-web-devtools/SKILL.md): read and send user-approved Telegram messages in Telegram Web K inside the user's open Chrome through the Chrome DevTools Protocol. Includes a long-lived local bridge, guarded send and reply-check scripts, a contact tracker for monitoring, pacing, and safety rules. Works in Codex, Claude Code, and other agents that run shell commands.

## Install

Install a skill with the [Skills CLI](https://skills.sh/docs/cli):

```sh
npx skills add DXVSI/agent-skills --skill natural-writing
npx skills add DXVSI/agent-skills --skill telegram-web-devtools
```

The CLI lets you select the target agents. You can also copy a complete `skills/<skill-name>/` directory into your agent's skill directory, or import it into your existing skill synchronization workflow.

`telegram-web-devtools` also needs a one-time runtime setup: Node.js, `playwright-core`, and remote debugging enabled in Chrome by the user. Its [SKILL.md](skills/telegram-web-devtools/SKILL.md) describes the steps.

## Use natural-writing for every response

Installation makes the skill available. To apply it throughout conversations, add this standing instruction to your agent's global instructions, such as `AGENTS.md` or `CLAUDE.md`:

```text
Apply the natural-writing skill to every user-facing reply and progress update.
Read the skill at the start of a session and keep its guidance active across topics.
Preserve factual accuracy, material uncertainty, and the user's requested language and format.
```

If you use Rulesync or another configuration manager, add the instruction to its canonical rules and synchronize the clients. Existing sessions may need to reload their instructions.

## Add a skill

Place each skill in `skills/<skill-name>/` with a `SKILL.md` entrypoint. Include any referenced files inside that directory so it can be installed on its own. Keep instructions and examples in English, and record authorship, sources, and the license.

## License and attribution

Licensed under [CC BY-SA 4.0](LICENSE). The `natural-writing` skill adapts observations from a Russian Wikipedia essay; its [source notes](skills/natural-writing/references/source.md) preserve attribution and describe the changes. The `telegram-web-devtools` skill and its scripts are original work by DXVSI; the scripts depend on [playwright-core](https://github.com/microsoft/playwright) (Apache-2.0), which is installed separately and not bundled.
