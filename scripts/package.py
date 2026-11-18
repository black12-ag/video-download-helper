"""Build the extension archive with optional local-helper source."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / "extension"
manifest = json.loads((source / "manifest.json").read_text())
output = root / "dist" / f"video-download-helper-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            archive.write(file, file.relative_to(source))
    for name in ["LICENSE", "PRIVACY.md", "README.md", "docs/popup.png"]:
        archive.write(root / name, name)
    for file in sorted((root / 'companion').iterdir()):
        if file.is_file() and file.suffix in ['.py', '.sh', '.md']:
            archive.write(file, file.relative_to(root))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read("manifest.json"))["version"] == manifest["version"]
    assert all(name in archive.namelist() for name in ["background.js", "popup.html", "popup.js", "media.js", "scan.js", "engine.js", "downloads.js", "transfers.js", "companion/host.py"])
print(output)
