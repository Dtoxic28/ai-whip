from pathlib import Path
import hashlib, json, zipfile
root = Path(__file__).resolve().parent.parent
roles = ["src/lib/detector.ts", ".verification/DIFF_FILE.patch", ".verification/VERIFICATION.txt", ".verification/ROLLBACK.sh"]
for name in roles:
    assert (root / name).read_bytes()
assert (root / "src/lib/detector.ts").read_bytes() != (root / ".verification/pristine.detector.ts").read_bytes()
assert (root / ".verification/rollback-copy.ts").read_bytes() == (root / ".verification/pristine.detector.ts").read_bytes()
manifest = json.loads((root / ".verification/SOURCE_MANIFEST.json").read_text())
with zipfile.ZipFile(root / "AI-WHIP-SOURCE.zip") as zipped:
    assert zipped.testzip() is None
    for name, expected in manifest.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected
        assert hashlib.sha256(zipped.read("ai-whip/" + name)).hexdigest() == expected
    assert zipped.getinfo("ai-whip/.verification/ROLLBACK.sh").external_attr >> 16 == 0o755
assert (root / ".verification/RESULTS.md").read_text()
print("Four evidence roles reopened; ZIP CRC/source hashes valid; rollback executable; restored hash equals pristine; application detector remains changed.")
