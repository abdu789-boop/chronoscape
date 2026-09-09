#!/usr/bin/env python3
"""Acquire and normalize independent ruler references, never publish atlas data.

Requires pandas and pypdf for Archigos' published Stata file and country labels.
Run with --fetch to refresh public downloads; without it, uses cached snapshots.
Names, source polity/office, dates and locators remain distinct from atlas matches.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import urllib.request
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/raw/rulers"
OUT = ROOT / "sources/rulers"
ARCHIGOS = "https://www.rochester.edu/college/faculty/hgoemans/"
GITHUB = "https://raw.githubusercontent.com/alicetinkaya76/islamic-civilization-atlas/main/data/"
DOWNLOADS = {
    "archigos-4.1.dta": ARCHIGOS + "Archigos_4.1_stata14.dta",
    "archigos-4.1.pdf": ARCHIGOS + "Archigos_4.1.pdf",
    "archigos.html": ARCHIGOS + "data.htm",
    "all_rulers_merged.csv": GITHUB + "all_rulers_merged.csv",
    "all_dynasties_enriched.csv": GITHUB + "all_dynasties_enriched.csv",
    "DATA_DICTIONARY.md": GITHUB + "DATA_DICTIONARY.md",
    "uk-reigns.csv": "https://api.parliament.uk/regnal-years/reigns.csv",
    "met-islamic.html": "https://www.metmuseum.org/toah/hd/isru/hd_isru.htm",
}


def snapshot(name):
    path = CACHE / name
    return {
        "path": str(path.relative_to(ROOT)),
        "url": DOWNLOADS[name],
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "retrievedAt": dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat(),
    }


def fetch(name):
    request = urllib.request.Request(DOWNLOADS[name], headers={"User-Agent": "Chronoscape source research/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
    (CACHE / name).write_bytes(data)


def date_bound(text):
    """Do not turn century-only, unknown, or continuing dates into exact years."""
    raw = str(text or "").strip()
    value = {"raw": raw, "year": None, "precision": "unknown"}
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        dt.date.fromisoformat(raw)
        value.update(year=int(raw[:4]), date=raw, precision="day")
    elif re.fullmatch(r"(?:c\.\s*)?-?\d{1,4}\??", raw):
        year = int(re.search(r"-?\d+", raw).group())
        if year:
            value.update(year=year, precision="year", approximate=raw.startswith("c."), uncertain="?" in raw)
    return value


def write_dataset(filename, source_id, source, records, extra=None):
    ids = [r["id"] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source record identifiers")
    for row in records:
        a, b = row["from"].get("year"), row["to"].get("year")
        if a is not None and b is not None and a > b:
            row["flags"].append("source-dates-reversed")
    data = {"schemaVersion": 1, "sources": {source_id: source}, "records": records,
            "coverage": {"recordCount": len(records), "sourcePolityCount": len({r["polity"]["sourceId"] for r in records}),
                         "atlasMatchesReviewed": 0, "completeAtlasRostersClaimed": 0}}
    if extra:
        data.update(extra)
    path = OUT / filename
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{path.relative_to(ROOT)}: {data['coverage']}")


def archigos():
    import pandas as pd
    from pypdf import PdfReader

    # The codebook names the exact units used in the data. Avoid guessing an
    # atlas identity from a modern country name or using a different code system.
    lookup, section = {}, None
    pages = PdfReader(CACHE / "archigos-4.1.pdf").pages
    for number, page in enumerate(pages[11:], 12):
        text = page.extract_text()
        for line in text.splitlines():
            heading = re.match(r"^2\.\d+\s*([A-Z][^\n]+)$", line)
            if heading:
                section = {"name": heading.group(1).strip(), "pdfPage": number}
            row = re.match(r"^([A-Z]{3})-\d[\d-]*\s+(\d+)\s+([A-Z]{3})\s", line)
            if row and section:
                code = f"{row.group(2)}:{row.group(3)}"
                if code in lookup and lookup[code]["name"] != section["name"]:
                    raise ValueError(f"Conflicting codebook country labels for {code}")
                lookup[code] = section.copy()
    table = pd.read_stata(CACHE / "archigos-4.1.dta", convert_categoricals=False)
    records = []
    for row in table.to_dict("records"):
        code = f"{int(row['ccode'])}:{row['idacr']}"
        place = lookup.get(code, {})
        flags = ["effective-primary-leader-office", "atlas-polity-match-unreviewed"]
        end = date_bound(row["enddate"])
        if row["exit"] == "Still in Office":
            end["rightCensored"] = True
            flags.append("end-is-observation-cutoff-not-exit")
        if not place:
            flags.append("source-polity-label-unresolved")
        records.append({
            "id": "archigos-4.1:" + row["obsid"], "source": "archigos-4.1",
            "sourceRecordId": row["obsid"], "sourcePersonId": row["leadid"], "name": row["leader"],
            "polity": {"name": place.get("name", row["idacr"]), "sourceId": code,
                       "ccode": int(row["ccode"]), "idacr": row["idacr"]},
            "office": "Effective primary political leader (Archigos definition)",
            "from": date_bound(row["startdate"]), "to": end,
            "locator": {"url": DOWNLOADS["archigos-4.1.dta"], "rowId": row["obsid"],
                        "caseDescriptionUrl": DOWNLOADS["archigos-4.1.pdf"], "countrySectionPdfPage": place.get("pdfPage")},
            "sourceCodes": {"entry": row["entry"], "exit": row["exit"], "previousTimesInOffice": int(row["prevtimesinoffice"])},
            "flags": flags,
        })
    source = {
        "title": "Archigos: A Data Set on Leaders 1875–2015, version 4.1",
        "authors": ["Henk E. Goemans", "Kristian Skrede Gleditsch", "Giacomo Chiozza"],
        "url": ARCHIGOS + "data.htm", "lineage": "archigos-goemans-gleditsch-chiozza",
        "citation": "Goemans, Gleditsch and Chiozza (2009), Journal of Peace Research 46(2), 269–283.",
        "scope": "Effective primary leaders of independent states in the authors' state system, observed 1875–2015; inherited spells can begin earlier. Not all monarchs or all heads of state.",
        "reuse": "Public author-hosted research download; authors request citation. No explicit open-data licence found on the download page.",
        "reviewStatus": "source-sampling-in-progress", "snapshots": [snapshot(n) for n in ("archigos-4.1.dta", "archigos-4.1.pdf", "archigos.html")],
        "limitations": ["Censored ends are observation cutoffs, not asserted exits.", "Country codes can span regime changes; match historical atlas identity and time explicitly.", "Names use varying spelling conventions.", "PLT/H-DATA incorporates Archigos and is not wholly independent."],
    }
    write_dataset("reference-archigos.json", "archigos-4.1", source, records)


def islamic():
    with (CACHE / "all_dynasties_enriched.csv").open(encoding="utf-8-sig") as file:
        dynasties = {row["dynasty_id"]: row for row in csv.DictReader(file)}
    with (CACHE / "all_rulers_merged.csv").open(encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))
    records = []
    for line, row in enumerate(rows, 2):
        dynasty = dynasties[row["dynasty_id"]]
        start, end = date_bound(row["reign_start_ce"]), date_bound(row["reign_end_ce"])
        flags = ["selective-roster", "atlas-polity-match-unreviewed", "derived-bosworth-transcription-unverified"]
        if start["year"] is None or end["year"] is None:
            flags.append("regnal-boundary-unresolved")
        if any(bound.get("approximate") or bound.get("uncertain") for bound in (start, end)):
            flags.append("source-date-uncertainty")
        records.append({
            "id": "islamic-atlas:" + row["person_id"], "source": "islamic-atlas",
            "sourceRecordId": row["person_id"], "name": row["full_name_original"], "shortName": row["short_name"],
            "polity": {"name": dynasty["dynasty_name_en"], "sourceId": row["dynasty_id"],
                       "nameOriginal": row["dynasty_name"], "subBranch": row["sub_branch"], "region": row["region"]},
            "office": row["role"], "titleOriginal": row["title"], "from": start, "to": end,
            "locator": {"url": DOWNLOADS["all_rulers_merged.csv"], "rowId": row["person_id"], "csvRecordNumber": line,
                        "dynastyChapter": dynasty["chapter"]},
            "sourceDates": {"startHijri": row["reign_start_hijri"], "endHijri": row["reign_end_hijri"]}, "flags": flags,
        })
    source = {
        "title": "Islamic Civilization Atlas — ruler and dynasty CSVs",
        "authors": ["Hüseyin Gökalp", "Ali Çetinkaya"],
        "url": "https://zenodo.org/records/18824469", "repository": "https://github.com/alicetinkaya76/islamic-civilization-atlas",
        "lineage": "bosworth-new-islamic-dynasties", "underlyingSource": "C. E. Bosworth, The New Islamic Dynasties (1996; 2004 edition cited by dataset)",
        "scope": "830 selected entries associated with 186 dynasties; includes subordinate offices and some collective or religious leadership entries.",
        "reuse": "Repository declares CC BY-SA 4.0. Attribute the compilers and preserve the underlying Bosworth lineage.",
        "reviewStatus": "source-sampling-in-progress", "snapshots": [snapshot(n) for n in ("all_rulers_merged.csv", "all_dynasties_enriched.csv", "DATA_DICTIONARY.md")],
        "limitations": ["Do not label the roster complete: many large dynasties contain only selected rulers.", "Source enrichment has observed errors; no succession, religious, narrative or demographic enrichment is imported.", "No Bosworth page-level citations; chapter and source row identifiers are preserved.", "Restorations may be collapsed in source and require review before display.", "GitHub snapshot was downloaded after Zenodo ZIP returned HTTP 504; do not claim byte-identical Zenodo release."],
    }
    write_dataset("reference-islamic.json", "islamic-atlas", source, records)


# Explicit source jurisdiction aliases. Dynasty numbers are the source's keys,
# not inferred from a ruler's ethnicity or place of birth.
ISLAMIC_ALIASES = {
    "1": "Rashidun Caliphate", "2": "Umayyad Caliphate", "3": "Abbasid Caliphate",
    "8": "Idrisids", "9": "Rustamid dynasty", "11": "Aghlabid Dynasty",
    "14": "Almoravid Dynasty", "15": "Almohad Caliphate", "16": "Marinid Sultanate",
    "17": "Zayyanid dynasty", "18": "Hafsid Dynasty", "19": "Wattasid dynasty",
    "20": "Saadi Sultanate", "22": "Beylik of Tunis", "23": "Karamanli Dynasty",
    "25": "Tulunids", "27": "Fatimid Caliphate", "30": "Ayyubid Sultanate",
    "31": "Mamluk Sultanate", "34": "Muhammad Ali dynasty", "35": "Hamdanid Emirates",
    "40": "Qarmatians", "42": "Ziyadid dynasty", "44": "Najahid Dynasty",
    "45": "Sulayhid Dynasty", "46": "Zurayid dynasty", "49": "Rasulid Dynasty",
    "50": "Tahirid Sultanate", "58": "Mali Empire", "61": "Sokoto Caliphate",
    "75": "Buyid Dynasty", "79": "Dabuyid Dynasty", "83": "Samanid Empire",
    "84": "Saffarid Dynasty", "89": "Khwarezmid Empire", "91": "Great Seljuk Empire",
    "93": "Zengid dynasty", "108": "Danishmendids", "124": "Beylik of Karaman",
    "130": "Ottoman Empire", "131": "Mongol Empire", "132": "Chagatai Khanate",
    "133": "Ilkhanate", "134": "Golden Horde", "135": "Crimean Khanate",
    "136": "Astrakhan Khanate", "137": "Khanate of Kazan", "142": "Jalayirid Sultanate",
    "144": "Timurid Empire", "145": "Qara Qoyunlu", "146": "Aq Qoyunlu",
    "148": "Safavid Dynasty", "149": "Afsharid Iran", "150": "Zand Dynasty",
    "151": "Qajar Dynasty", "152": "Pahlavi Dynasty", "158": "Ghaznavid Empire",
    "159": "Ghurid Dynasty", "167": "Bahmani Sultanate", "170": "Bijapur Sultanate",
    "171": "Ahmadnagar Sultanate", "172": "Berar Sultanate", "173": "Golconda Sultanate",
    "175": "Mughal Empire", "178": "Hyderabad State", "182": "Sultanate of Aceh",
    "186": "Sultanate of Brunei",
}

# Display names transcribed from the National Archives' "US Presidents in the
# Census Records", Dates in Office table, inspected 2026-09-09. This does not
# change or independently verify the source dataset's exact tenure dates.
USA_DISPLAY_NAMES = {
    "USA-1869": "Ulysses S. Grant", "USA-1877": "Rutherford B. Hayes",
    "USA-1881-1": "James A. Garfield", "USA-1881-2": "Chester A. Arthur",
    "USA-1885": "Grover Cleveland", "USA-1889": "Benjamin Harrison",
    "USA-1893": "Grover Cleveland", "USA-1897": "William McKinley",
    "USA-1901": "Theodore Roosevelt", "USA-1909": "William Howard Taft",
    "USA-1913": "Woodrow Wilson", "USA-1921": "Warren G. Harding",
    "USA-1923": "Calvin Coolidge", "USA-1929": "Herbert Hoover",
    "USA-1933": "Franklin D. Roosevelt", "USA-1945": "Harry S. Truman",
    "USA-1953": "Dwight D. Eisenhower", "USA-1961": "John F. Kennedy",
    "USA-1963": "Lyndon B. Johnson", "USA-1969": "Richard Nixon",
    "USA-1974": "Gerald R. Ford", "USA-1977": "Jimmy Carter",
    "USA-1981": "Ronald Reagan", "USA-1989": "George H. W. Bush",
    "USA-1993": "Bill Clinton", "USA-2001": "George W. Bush",
    "USA-2009": "Barack Obama",
}


def fold(value):
    value = ''.join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", value)


def uk_parliament():
    with (CACHE / "uk-reigns.csv").open(encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))
    records = []
    for line, row in enumerate(rows, 2):
        record_id = f"csv-row-{line}"
        records.append({"id": "uk-parliament:" + record_id, "source": "uk-parliament-regnal-years",
                        "sourceRecordId": record_id, "name": row["Monarch"],
                        "polity": {"name": row["Kingdom"], "sourceId": fold(row["Kingdom"])},
                        "office": "Monarch", "from": date_bound(row["Start date"]), "to": date_bound(row["End date"]),
                        "locator": {"url": DOWNLOADS["uk-reigns.csv"], "csvRecordNumber": line},
                        "flags": ["official-regnal-year-scope", "atlas-polity-match-unreviewed"]})
    source = {"title": "UK Parliament — Reigns", "authors": ["UK Parliament"],
              "url": "https://api.parliament.uk/regnal-years/reigns", "lineage": "uk-parliament-regnal-years",
              "scope": "Twelve reign/jurisdiction entries for ten monarchs from George III onward, separating Great Britain, Ireland and the United Kingdom.",
              "reuse": "Open Parliament Licence", "reviewStatus": "official-source-extraction-only",
              "snapshots": [snapshot("uk-reigns.csv")]}
    write_dataset("reference-uk-parliament.json", "uk-parliament-regnal-years", source, records)


def country_fold(value):
    # Only formal country prefixes, not arbitrary token/fuzzy matching.
    value = value.lower().strip()
    value = re.sub(r"^(the |people's democratic republic of |democratic people's republic of |people's republic of |islamic republic of |federated republic of |federal republic of |oriental republic of |commonwealth of the |commonwealth of |republic of the |republic of |kingdom of |sultanate of |principality of |state of )", "", value)
    return fold(value)


def build_imports():
    index = json.loads((ROOT / "docs/data/polity_index.json").read_text())
    entries = {key: value for key, value in index.items() if key != "_span"}
    country_index, name_index = {}, {}
    for key, polity in entries.items():
        country_index.setdefault(country_fold(polity["n"]), []).append((key, polity))
        name_index.setdefault(polity["n"], []).append((key, polity))
    inputs = [json.loads((OUT / f"reference-{name}.json").read_text()) for name in ("archigos", "islamic")]
    sources = {key: value for data in inputs for key, value in data["sources"].items()}
    for source in sources.values():
        source.update(kind="scholarly", admission="candidate", checks=[])
    source_rows = {row["id"]: row for data in inputs for row in data["records"]}
    source_sequences = {row["id"]: sequence for data in inputs for sequence, row in enumerate(data["records"], 1)}
    crosswalk, imports, unresolved, conflicts, matched = {}, [], [], [], []
    profile_overrides = {
        "wd:Q23666": {"scope": "British national leadership, including the United Kingdom after 1801.",
                       "note": "The atlas groups this continuation under Kingdom of Great Britain. Prime ministers and monarchs are separate offices."}
    }
    country_aliases = {"SUR": "Suriname", "CAP": "Cabo Verde", "CDI": "Côte d'Ivoire", "TUN": "Tunisia",
                       "QAT": "Qatar", "KYR": "Kyrgyzstan", "MAC": "Former Yugoslav Republic of Macedonia",
                       "BOS": "Bosnia and Herzegovina", "TAW": "Republic of China", "SRI": "Sri Lanka",
                       "MYA": "Union of Myanmar", "CAM": "Kingdom of Cambodia", "TAZ": "Tanzania",
                       "DRC": "Democratic Republic of the Congo", "YEM": "Republic of Yemen",
                       "YPR": "People's Democratic Republic of Yemen", "PRK": "Democratic People's Republic of Korea",
                       "ROK": "Republic of Korea", "RUM": "Romania", "RUS": "Russian Federation"}
    for row in source_rows.values():
        first, last = row["from"]["year"], row["to"]["year"]
        if first is None or last is None or first > last:
            unresolved.append({"recordId": row["id"], "reason": "Unknown or invalid regnal boundary"}); continue
        source_id = row["source"]
        if source_id == "islamic-atlas":
            # The source explicitly compresses these interrupted reigns to one
            # outer interval. They need episode reconstruction, not a continuous
            # 'active ruler' interval. Preserve raw records for that later work.
            if row["sourceRecordId"] in {"31-007", "31-008", "31-009", "36-005", "43-002", "44-002", "60-007", "157-003"}:
                unresolved.append({"recordId": row["id"], "reason": "Source compresses interrupted reigns; separate tenure episodes required"}); continue
            if row["office"] in {"Emirler (ortak)", "Kolektif yönetim"}:
                unresolved.append({"recordId": row["id"], "reason": "Collective entry is not a single named officeholder"}); continue
            if row["polity"]["sourceId"] == "91" and not row["polity"].get("subBranch", "").startswith("1."):
                unresolved.append({"recordId": row["id"], "reason": "Syrian/Kirman Seljuq branch requires its own atlas jurisdiction"}); continue
            if row["polity"]["sourceId"] == "131" and row["polity"].get("subBranch"):
                unresolved.append({"recordId": row["id"], "reason": "Yuan office/fragmented Mongol sovereignty requires a distinct scope"}); continue
            name = ISLAMIC_ALIASES.get(row["polity"]["sourceId"])
            candidates = name_index.get(name, [])
        else:
            acronym = row["polity"]["idacr"]
            if acronym == "UKG":
                candidates = [("wd:Q23666", entries["wd:Q23666"])]
            elif acronym == "SWZ":
                unresolved.append({"recordId": row["id"], "reason": "Swiss collective executive requires a dedicated office track"}); continue
            else:
                name = country_aliases.get(acronym, row["polity"]["name"])
                candidates = country_index.get(country_fold(name), [])
        # Overlap selects among historical identities. Preserve the actual source
        # tenure instead of clipping its endpoints to coarse map timestamps.
        candidates = [(key, p) for key, p in candidates if first <= p["last"] and last >= p["first"]]
        if len(candidates) != 1:
            unresolved.append({"recordId": row["id"], "reason": "No unique jurisdiction/time crosswalk", "candidateKeys": [k for k, _ in candidates]}); continue
        key, polity = candidates[0]
        if source_id == "archigos-4.1" and (first < polity["first"] - 15 or last > polity["last"] + 15):
            unresolved.append({"recordId": row["id"], "reason": "Tenure crosses a mapped regime identity by more than 15 years"}); continue
        crosswalk[row["id"]] = {"polityKey": key, "sourcePolity": row["polity"], "atlasName": polity["n"],
                                 "method": "explicit-source-jurisdiction-alias" if source_id == "islamic-atlas" or row["polity"].get("idacr") in country_aliases or row["polity"].get("idacr") == "UKG" else "exact-country-name-after-formal-prefix-normalization", "datesClipped": False}
        person = f"{source_id}:{row.get('sourcePersonId', row['sourceRecordId'])}"
        role = row["office"]
        precision = "approximate" if any(bound.get("approximate") or bound.get("uncertain") for bound in (row["from"], row["to"])) else "year"
        observation = {"personKey": person, "polityKey": key, "role": role, "from": first, "to": last, "precision": precision, "calendar": "historical"}
        if row["to"].get("rightCensored"):
            observation.update(to=None, ongoing=True, asOf=last)
        assertion = {**observation, "sourceId": source_id, "sourceRecordId": row["sourceRecordId"],
                     "locator": row["locator"]["url"] + " (record " + row["sourceRecordId"] + ")",
                     "imported": True, "snapshot": {k: sources[source_id]["snapshots"][0][k] for k in ("path", "sha256")}}
        note = "Selected source entry; the roster is incomplete."
        if row["polity"].get("subBranch"):
            note += " Source jurisdiction: " + row["polity"]["subBranch"] + "."
        if observation.get("ongoing"):
            note += " Source observation ends in 2015; this does not establish current incumbency."
        claim = {"id": row["id"], **observation, "name": row["name"], "note": note, "assertions": [assertion],
                 "sourceDates": {"from": row["from"]["raw"], "to": row["to"]["raw"]},
                 "sequence": source_sequences[row["id"]]}
        if source_id == "archigos-4.1" and row["sourceRecordId"] in USA_DISPLAY_NAMES:
            claim["sourceName"] = row["name"]
            claim["name"] = USA_DISPLAY_NAMES[row["sourceRecordId"]]
            claim["displayNameSource"] = {
                "url": "https://www.archives.gov/research/census/presidents",
                "locator": "Dates in Office table, " + claim["name"],
            }
        imports.append(claim)

    # Independent observations read from the linked institutional records. The
    # benchmark's precision is years; exact-day disagreements are not certified.
    modern_samples = [
        ("USA-1869", "us-national-archives", "Ulysses S. Grant", 1869, 1877, "https://www.archives.gov/research/census/presidents"),
        ("USA-1885", "us-national-archives", "Grover Cleveland, first presidency", 1885, 1889, "https://www.archives.gov/research/census/presidents"),
        ("USA-1893", "us-national-archives", "Grover Cleveland, second presidency", 1893, 1897, "https://www.archives.gov/research/census/presidents"),
        ("UKG-1979", "uk-government-pm-history", "Margaret Thatcher", 1979, 1990, "https://www.gov.uk/government/history/past-prime-ministers/margaret-thatcher"),
        ("IND-1947", "india-prime-ministers-office", "Jawaharlal Nehru", 1947, 1964, "https://www.pmindia.gov.in/en/former_pm/shri-jawaharlal-nehru/"),
        ("SAF-1994", "nelson-mandela-foundation", "Nelson Mandela", 1994, 1999, "https://www.nelsonmandela.org/discovering-new-enemies-post-1994"),
        ("AUL-1975", "australian-national-archives", "Malcolm Fraser", 1975, 1983, "https://www.naa.gov.au/explore-collection/australias-prime-ministers/malcolm-fraser/during-office"),
    ]
    islamic_samples = [
        ("1-001", "Abu Bakr; Rashidun Dynasty", 632, 634),
        ("2-001", "Mu'awiya I; Umayyad Dynasty", 661, 680),
        ("25-001", "Ahmad ibn Tulun; Tulunid Dynasty", 868, 884),
        ("27-001", "Ubaydullah al-Mahdi; Fatimid Dynasty", 909, 934),
        ("30-001", "Salah al-Din; Ayyubid Dynasty (Egypt)", 1169, 1193),
        ("130-006", "Süleyman I; Ottoman Dynasty", 1520, 1566),
        ("144-001", "Timur; Timurid dynasty", 1370, 1405),
        ("148-001", "Isma'il I; Safavid Dynasty", 1501, 1524),
        ("149-001", "Nadir Shah; Afsharid Dynasty", 1736, 1747),
        ("158-002", "Mahmud; Ghaznavid Dynasty", 998, 1030),
    ]
    benchmark_specs = [("archigos-4.1", *item) for item in modern_samples]
    benchmark_specs += [("islamic-atlas", record, "met-islamic-benchmark", title, first, last, DOWNLOADS["met-islamic.html"]) for record, title, first, last in islamic_samples]
    sampled = {"archigos-4.1": [], "islamic-atlas": []}
    by_id = {claim["id"]: claim for claim in imports}
    for source_id, record_id, peer_id, title, first, last, url in benchmark_specs:
        record_key = ("archigos-4.1:" if source_id == "archigos-4.1" else "islamic-atlas:") + record_id
        claim = by_id.get(record_key)
        if not claim:
            conflicts.append({"recordId": record_key, "reason": "Benchmark could not resolve atlas scope"}); continue
        sampled[source_id].append(record_id)
        sources.setdefault(peer_id, {"title": peer_id.replace('-', ' ').title(), "url": url,
                                    "lineage": "metropolitan-museum-art" if peer_id == "met-islamic-benchmark" else peer_id,
                                    "kind": "institutional", "admission": "candidate", "checks": []})
        peer = {k: v for k, v in claim["assertions"][0].items() if k not in {"sourceId", "sourceRecordId", "locator", "imported", "snapshot"}}
        peer.update(sourceId=peer_id, sourceRecordId=title, locator=url + " (" + title + ")")
        peer.update({"from": first, "to": last})
        if (claim["from"], claim["to"]) != (first, last):
            conflicts.append({"recordId": record_key, "reason": "Source sample regnal years disagree", "observed": claim["assertions"][0], "againstObserved": peer})
            imports.remove(claim)
        else:
            claim["assertions"].append(peer)
            matched.append(claim)
            imports.remove(claim)
    for source_id, ids in sampled.items():
        sources[source_id]["review"] = {"method": "sampled", "sampleRecordIds": ids,
                                        "samplingNote": "Institutional checks at year precision across periods, regions and office types; includes a nonconsecutive presidency and a recorded Ghaznavid date disagreement. These samples do not establish complete rosters or exact-day accuracy."}
        sources[source_id]["reviewStatus"] = "sampled"
    result = {"schemaVersion": 1, "sources": sources, "matched": matched, "imports": imports,
              "conflicts": conflicts, "unresolved": unresolved, "crosswalk": crosswalk,
              "profileOverrides": profile_overrides,
              "receipts": [snap for source in inputs for value in source["sources"].values() for snap in value["snapshots"]],
              "summary": {"matchedSamples": len(matched), "imports": len(imports), "sampleConflicts": len(conflicts),
                          "politiesWithImports": len({c["polityKey"] for c in imports + matched}), "unresolved": len(unresolved)}}
    (OUT / "reference-import.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print("reference-import.json:", result["summary"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--source", choices=("archigos", "islamic", "all"), default="all")
    parser.add_argument("--imports-only", action="store_true")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    if (CACHE / "uk-reigns.csv").exists():
        uk_parliament()
    if args.imports_only:
        build_imports()
        return
    files = []
    if args.source in ("archigos", "all"):
        files.extend(("archigos-4.1.dta", "archigos-4.1.pdf", "archigos.html"))
    if args.source in ("islamic", "all"):
        files.extend(("all_rulers_merged.csv", "all_dynasties_enriched.csv", "DATA_DICTIONARY.md"))
    if args.fetch:
        for name in files:
            fetch(name)
    if args.source in ("archigos", "all"):
        archigos()
    if args.source in ("islamic", "all"):
        islamic()
    if args.source == "all":
        build_imports()


if __name__ == "__main__":
    main()
