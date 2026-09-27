# Agent Skills

Reusable skills for AI agents, authored and maintained by [DXVSI](https://github.com/DXVSI). Instructions and supporting materials are written in English. Skills follow the user's requested language when producing content.

## Available skills

- [natural-writing](skills/natural-writing/SKILL.md): write clear, natural prose while preserving facts, uncertainty, citations, and the requested format. Includes worked editing examples.

## Install

Install a skill with the [Skills CLI](https://skills.sh/docs/cli):

```sh
npx skills add DXVSI/agent-skills --skill natural-writing
```

The CLI lets you select the target agents. You can also copy the complete `skills/natural-writing/` directory into your agent's skill directory, or import it into your existing skill synchronization workflow.

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

Licensed under [CC BY-SA 4.0](LICENSE). The `natural-writing` skill adapts observations from a Russian Wikipedia essay; its [source notes](skills/natural-writing/references/source.md) preserve attribution and describe the changes.
