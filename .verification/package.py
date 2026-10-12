from pathlib import Path
import hashlib, json, zipfile
root = Path(__file__).resolve().parent.parent
files = []
for folder in ["src", "public", "tests", "fixtures", "docs", ".github"]:
    files.extend(p for p in (root / folder).rglob("*") if p.is_file())
files.extend(p for p in root.iterdir() if p.is_file() and p.suffix != ".zip" and p.name != "tsconfig.tsbuildinfo" and (not p.name.startswith(".env") or p.name == ".env.example"))
manifest = {str(p.relative_to(root)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
(root / ".verification/SOURCE_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
archive = root / "AI-WHIP-SOURCE.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
    for p in files:
        zipped.write(p, "ai-whip/" + str(p.relative_to(root)).replace("\\", "/"))
    names = ["VERIFICATION.txt", "ROLLBACK.sh", "pristine.detector.ts", "DIFF_FILE.patch", "detector-input.json", "detector-check.mjs", "run-record.mjs", "SOURCE_MANIFEST.json", "desktop.png", "mobile.png", "detected-failure.png", "verified-work.png", "RESULTS.md", "package.py"]
    for name in names:
        p = root / ".verification" / name
        if p.exists():
            info = zipfile.ZipInfo("ai-whip/.verification/" + name)
            info.external_attr = (0o755 if name == "ROLLBACK.sh" else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zipped.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert "ai-whip/src/lib/detector.ts" in zipped.namelist()
    assert zipped.getinfo("ai-whip/.verification/ROLLBACK.sh").external_attr >> 16 == 0o755
    for name, sha in manifest.items():
        assert hashlib.sha256(zipped.read("ai-whip/" + name)).hexdigest() == sha
print("SOURCE_ARCHIVE:", archive)
print("SOURCE_FILES:", len(manifest))
print("ARCHIVE_VERIFICATION: ZIP CRC valid; all source SHA256 values match; rollback mode 0755")
