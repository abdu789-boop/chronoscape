#!/usr/bin/env python3
"""Recover explicit jurisdiction matches from already downloaded ruler sources.

This step performs no network requests. Source admission and representative
independent checks are inherited from reference-import.json. The crosswalk is
explicit and uses actual regime identities rather than the map's approximate
first/last geometry timestamps. It never clips source tenure boundaries.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources/rulers/additional-extracted.json"

# Archigos national codes, inclusive accession-year window, exact atlas key.
# Windows distinguish successive regimes; they do not create reign dates.
MODERN = {
    "FRN": [(1870,1939,"wd:Q70802"),(1940,1943,"wd:Q69808"),(1947,1957,"wd:Q69829"),(1959,2015,"wd:Q200686")],
    "JPN": [(1868,1944,"nm:empireofjapan")],
    "ARG": [(1930,2015,"wd:Q414")],
    "BRA": [(1822,1888,"wd:Q217230"),(1889,1936,"nm:brazilianrepublic"),(1937,1944,"nm:unitarystateofbrazil"),(1945,1966,"nm:brazilianrepublic"),(1967,1986,"nm:federatedrepublicofbrazil"),(1987,2015,"nm:republicofbrazil")],
    "IRE": [(1922,1936,"wd:Q31747"),(1937,2015,"wd:Q5306909")],
    "GMY": [(1871,1917,"wd:Q43287"),(1919,1932,"wd:Q41304"),(1933,1945,"wd:Q7318")],
    "GFR": [(1949,1989,"wd:Q713750"),(1990,2015,"wd:Q183")],
    "GDR": [(1949,1990,"wd:Q16957")],
    "GRC": [(1945,1966,"wd:Q209065"),(1967,1973,"wd:Q504081"),(1974,2015,"wd:Q17765809")],
    "AUS": [(1945,2015,"wd:Q187830")],
    "ROK": [(1948,2015,"nm:republicofkorea")],
    "TRI": [(1962,2015,"wd:Q754")],
    "POR": [(1933,1973,"wd:Q824489")],
    "RUS": [(1721,1916,"wd:Q34266"),(1917,1917,"wd:Q139319"),(1922,1990,"wd:Q15180")],
    "MYA": [(1820,1988,"nm:burma")],
    "IRQ": [(1958,2003,"nm:iraqirepublic")],
    "YUG": [(1945,1991,"nm:socialistfederalrepublicofyugoslavia"),(1992,2006,"wd:Q37024")],
    "MON": [(1911,1923,"nm:greatmongolstate"),(1924,1991,"wd:Q212056")],
    "TRA": [(1852,1901,"wd:Q550374")],
    "OFS": [(1854,1901,"wd:Q218023")],
    "IRN": [(1789,1924,"wd:Q189326"),(1925,1978,"wd:Q207991")],
    "EGY": [(1953,1957,"nm:republicofegypt"),(1958,1970,"wd:Q170468"),(1971,2015,"nm:arabrepublicofegypt")],
    "AFG": [(1823,1918,"wd:Q1335260"),(1926,1972,"wd:Q1138904"),(1973,1977,"wd:Q1415128")],
    "POL": [(1918,1939,"wd:Q207272")],
    "ETH": [(1270,1935,"wd:Q207521")],
    "TUR": [(1299,1921,"wd:Q12560")],
    "YEM": [(1918,1961,"wd:Q1998401")],
    "DRV": [(1976,2015,"wd:Q881")],
    "LIB": [(1969,2012,"wd:Q17435890")],
    "LAO": [(1953,1974,"wd:Q870055"),(1975,2015,"wd:Q819")],
    "SWA": [(1968,2015,"nm:eswatini")],
    "SYR": [(1946,1957,"wd:Q146885"),(1961,1962,"nm:republicofsyria"),(1963,1965,"nm:baathistsyria"),(1971,2015,"nm:syria")],
}

# Bosworth-derived chapter IDs are stable source identifiers, not fuzzy names.
ISLAMIC = {
    "7": "wd:Q238445", "12": "wd:Q118780154", "59": "wd:Q202687",
    "107": "wd:Q975405", "53":"wd:Q1752110", "70":"wd:Q3432153",
    "111":"wd:Q941887", "112":"nm:beylikofsaruhan", "113":"wd:Q717112",
    "118":"wd:Q2410637", "120":"wd:Q1386189", "128":"wd:Q2261321",
    "129":"wd:Q1264808", "138":"wd:Q836169", "139":"wd:Q1734616",
    "141":"wd:Q1067513", "143":"wd:Q1931074", "161":"wd:Q4083686",
    "162":"wd:Q123027565", "164":"wd:Q167134", "169":"wd:Q669317",
    "176":"wd:Q2637089", "179":"wd:Q266923", "181":"wd:Q46652",
    "183":"wd:Q402145",
}
TAIFAS = {"3.":"wd:Q276951", "6.":"wd:Q205708", "10.":"wd:Q2285679", "12.":"wd:Q276841", "13.":"wd:Q13534654"}
HOLD = {"31-007","31-008","31-009","36-005","43-002","44-002","60-007","157-003","7-025",
        # Additional compressed/restored or conflated tenures in the source.
        "53-003","70-002","107-002","120-001","129-002","139-002","162-001"}
MODERN_HOLD = {
    "IRE-1922-1","IRE-1922-2","IRE-1922-3", # Before December 1922 Free State.
    "FRN-1940-2","FRN-1958-2", # Leadership begins before the mapped regime.
    "GRC-1967-1", # Constitutional premiership preceding the junta coup.
    "TRA-1877","TRA-1879", # British annexation administrators, not republic.
    "IRQ-2003-2","IRQ-2003-3", # Coalition occupation administrators.
}


def modern_key(row):
    code = row["polity"]["idacr"]
    year = row["from"]["year"]
    if row["sourceRecordId"] in MODERN_HOLD: return None
    special = {"FRN-1940-1":"wd:Q70802","FRN-1958-1":"wd:Q69829"}
    if row["sourceRecordId"] in special: return special[row["sourceRecordId"]]
    # A single source spell crossing a distinct regime needs episode evidence.
    # One endpoint transition year is allowed because public precision is years;
    # multi-year continuations are withheld rather than cut into invented terms.
    choices = [key for start,end,key in MODERN.get(code,[])
               if start <= year <= end and row["to"]["year"] <= end + 1]
    # The June 1940 French premiership is not by itself Vichy state leadership;
    # Archigos identifies Petain's effective leadership explicitly.
    if code == "FRN" and year == 1940 and "petain" not in row["name"].lower():
        return None
    # Germany 1918 revolution and Russian 1917 Bolshevik accession cross distinct
    # constitutional identities; a dedicated episode source is needed.
    if code == "RUS" and year == 1917 and "lenin" in row["name"].lower():
        return None
    return choices[0] if len(choices) == 1 else None


def islamic_key(row):
    chapter = row["polity"]["sourceId"]
    branch = row["polity"].get("subBranch","")
    start = row["from"]["year"]
    if chapter == "4":
        # Abd al-Rahman III's accession predates his 929 caliphal proclamation;
        # the combined source interval cannot be assigned to either office.
        if row["sourceRecordId"] == "4-008": return None
        return "wd:Q1337854" if start < 929 else "wd:Q171740"
    if chapter == "5":
        return next((key for prefix,key in TAIFAS.items() if branch.startswith(prefix)),None)
    if chapter == "13":
        if branch.startswith("2."): return "wd:Q205718"
        if branch.startswith("3."): return "wd:Q588672"
    if chapter == "60":
        if branch.startswith("1."): return "nm:empireofkanem"
        if branch.startswith("3."): return "nm:bornuempire"
    if chapter == "89" and branch.startswith("4."): return "wd:Q486918"
    if chapter == "90":
        if start < 1040: return "nm:karakhanids"
        if branch.startswith("2."): return "nm:westernkarakhanidkhanate"
        if branch.startswith("3."): return "nm:easternkarakhanids"
    if chapter == "160":
        return {"1.":"wd:Q847420","2.":"wd:Q919071","3.":"wd:Q1124402","5.":"wd:Q11709"}.get(branch[:2])
    if chapter == "184" and start < 1830: return "wd:Q2122499"
    return ISLAMIC.get(chapter)


def main():
    base = json.loads((ROOT / "sources/rulers/reference-import.json").read_text())
    index = json.loads((ROOT / "docs/data/polity_index.json").read_text())
    seen = {r["id"] for label in ("imports","matched") for r in base[label]}
    records, unmatched, crosswalk, receipts = [], [], {}, []
    for label in ("archigos","islamic"):
        dataset = json.loads((ROOT / f"sources/rulers/reference-{label}.json").read_text())
        for sequence,row in enumerate(dataset["records"],1):
            if row["id"] in seen: continue
            first,last = row["from"]["year"],row["to"]["year"]
            if first is None or last is None or first > last: continue
            if label == "islamic" and (row["sourceRecordId"] in HOLD or row["office"] in {"Emirler (ortak)","Kolektif yönetim"}): continue
            key = modern_key(row) if label == "archigos" else islamic_key(row)
            if not key:
                unmatched.append({"id":row["id"],"reason":"No additional explicit jurisdiction crosswalk"})
                continue
            assert key in index, key
            source = row["source"]
            snap = dataset["sources"][source]["snapshots"][0]
            snapshot = {k:snap[k] for k in ("path","sha256")}
            assert hashlib.sha256((ROOT/snapshot["path"]).read_bytes()).hexdigest() == snapshot["sha256"]
            note = "Selected source entry; roster coverage is partial. "
            note += "Source jurisdiction: " + row["polity"]["name"]
            if row["polity"].get("subBranch"): note += "; " + row["polity"]["subBranch"]
            note += ". The atlas geometry's approximate period does not replace source tenure dates."
            record = {
                "id":row["id"],"polityKey":key,
                "personKey":f"{source}:{row.get('sourcePersonId',row['sourceRecordId'])}",
                "name":row["name"],"role":row["office"],"from":first,"to":last,
                "precision":"approximate" if any(b.get("approximate") or b.get("uncertain") for b in (row["from"],row["to"])) else "year",
                "calendar":"historical","sourceId":source,"sourceRecordId":row["sourceRecordId"],
                "locator":row["locator"]["url"] + " (record " + row["sourceRecordId"] + ")",
                "snapshot":snapshot,"sourceDates":{"from":row["from"]["raw"],"to":row["to"]["raw"]},
                "sequence":sequence,"note":note,
            }
            if row["to"].get("rightCensored"):
                record.update(to=None,ongoing=True,asOf=last)
                record["note"] += " Source observation ends in 2015; it does not establish current incumbency."
            records.append(record)
            crosswalk[row["id"]] = {"polityKey":key,"atlasName":index[key]["n"],"sourcePolity":row["polity"],"method":"explicit-source-code-and-regime-period","datesClipped":False}
        for source in dataset["sources"].values():
            for snap in source["snapshots"]:
                receipts.append({"file":snap["path"],"url":snap["url"],"sha256":snap["sha256"],"bytes":(ROOT/snap["path"]).stat().st_size})
    result = {"schemaVersion":1,"sources":{},"records":records,"receipts":receipts,
              "crosswalk":crosswalk,"unmatched":unmatched,
              "summary":{"records":len(records),"polities":len({r["polityKey"] for r in records}),"newPolitiesComparedWithReference":len({r["polityKey"] for r in records}-{r["polityKey"] for label in ("imports","matched") for r in base[label]}),
                         "sourceAdmission":"Inherited sampled reviews for archigos-4.1 and islamic-atlas"}}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(result["summary"]))


if __name__ == "__main__": main()
