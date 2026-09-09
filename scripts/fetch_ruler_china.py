"""Cache two independently compiled Chinese chronologies for accuracy comparison.

This fetcher emits candidate evidence only, never an accepted ruler dataset.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/china'
URLS = {
    'emperors.json': 'https://raw.githubusercontent.com/kotenbu135/emperor-stats/main/data/emperors.json',
    'dynasty0.html': 'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dynasty0.html',
    'dynasty1.html': 'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dynasty1.html',
    'dynasty2.html': 'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dynasty2.html',
    'dynasty3.html': 'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dynasty3.html',
}
URLS.update({f'dyn{page}-u.html': f'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dyn{page}-u.html' for page in range(12, 18)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    receipts = []
    for filename, url in URLS.items():
        path = CACHE / filename
        if not path.exists() and args.download:
            request = urllib.request.Request(url, headers={'User-Agent': 'Chronoscape-source-audit/1.0 (historical chronology comparison)'})
            with urllib.request.urlopen(request, timeout=40) as response:
                path.write_bytes(response.read())
        if not path.exists():
            raise SystemExit(f'Missing {filename}; run with --download')
        content = path.read_bytes()
        receipts.append({'url': url, 'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
        print(filename, len(content), flush=True)
    (CACHE / 'receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')


if __name__ == '__main__':
    main()
