# Self-Improvement

SWUST Code learns from your usage patterns and continuously improves.

## Dream (Knowledge Consolidation)

```bash
swust-code dream
```

Auto-triggers every 7 days. Scans recent session traces, extracts persistent knowledge into project memory, and removes outdated entries.

## Distill (Skill Discovery)

```bash
swust-code distill
```

Auto-triggers every 30 days. Discovers repeated manual workflows and packages high-confidence candidates into reusable skills.

## Auto-Trigger Mechanism

| Task | Interval | Check Condition |
|------|----------|-----------------|
| Dream | 7 days | Last Dream session time |
| Distill | 30 days | Last Distill session time |
