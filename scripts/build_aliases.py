"""Publish search aliases from sources/aliases.yaml as docs/data/aliases.json.

The YAML file maps a canonical polity name to the names sources use for it.
Search uses the same variants, so "Rome" finds the Roman Empire. Each canonical
name is attached to every index identity with exactly that display name; names
with no identity are reported and omitted.

    .venv/bin/python scripts/build_aliases.py          # regenerate
    .venv/bin/python scripts/build_aliases.py --check  # fail if out of date

build_app_data.py runs this before refreshing the cache fingerprints.
"""
import argparse
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "sources" / "aliases.yaml"
INDEX = ROOT / "docs" / "data" / "polity_index.json"
OUTPUT = ROOT / "docs" / "data" / "aliases.json"


def build(root=ROOT):
    """Return (aliases by identity key, canonical names without an identity)."""
    with (Path(root) / "sources" / "aliases.yaml").open(encoding="utf-8") as fh:
        canonical = yaml.safe_load(fh) or {}
    with (Path(root) / "docs" / "data" / "polity_index.json").open(encoding="utf-8") as fh:
        index = json.load(fh)
    keys_by_name = {}
    for key, entry in index.items():
        if key != "_span":
            keys_by_name.setdefault(entry["n"], []).append(key)
    aliases, unmatched = {}, []
    for name, variants in canonical.items():
        keys = keys_by_name.get(name)
        if not keys:
            unmatched.append(name)
            continue
        for key in keys:
            names = aliases.setdefault(key, [])
            for variant in variants or []:
                if variant != name and variant not in names:
                    names.append(variant)
    return {key: aliases[key] for key in sorted(aliases) if aliases[key]}, unmatched


def text(aliases):
    return json.dumps(aliases, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail when aliases.json needs regeneration")
    arguments = parser.parse_args()
    aliases, unmatched = build()
    expected = text(aliases)
    current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else None
    if arguments.check:
        if current != expected:
            parser.exit(1, "aliases.json is out of date. Run .venv/bin/python scripts/build_aliases.py\n")
        print(f"aliases: current for {len(aliases)} identities")
        return
    if current != expected:
        OUTPUT.write_text(expected, encoding="utf-8")
    print(f"aliases: {len(aliases)} identities, {sum(map(len, aliases.values()))} names"
          + (f"; no identity for {', '.join(unmatched)}" if unmatched else ""))


if __name__ == "__main__":
    main()
