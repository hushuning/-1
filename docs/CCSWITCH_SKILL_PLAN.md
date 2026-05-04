# CCSwitch skill bridge plan

Initial skill target: `hci-humanizer` from `sarkrui/CCSwitchSkills`.

The first skill bridge should be text-only and safe:

- `skills.list`
- `skills.read`
- `skills.apply`
- optional `skills.installFromGitHub` that generates install commands instead of executing them

Default skill search paths:

```text
~/.claude/skills
~/.config/opencode/skills
```

The server should treat skills as prompt packages, not executable code. It should read `SKILL.md` and optional sample files, then return a prompt for the web AI to apply.
