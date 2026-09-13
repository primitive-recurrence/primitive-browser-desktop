#!/usr/bin/env python3
"""Verify and describe a packaged Primitive Browser Linux release candidate."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import tarfile
import zipfile
from pathlib import Path

EXPECTED_PRIMITIVE_ENTRIES = {
    "chrome/browser/content/browser/primitive/PrimitiveShell.mjs",
    "chrome/browser/content/browser/primitive/PrimitiveExperience.mjs",
    "chrome/browser/content/browser/primitive/PrimitiveToolbar.mjs",
    "chrome/browser/content/browser/primitive/assets/primitive-mark.svg",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def primitive_entries_in_omnijar(stream: io.BufferedReader) -> set[str]:
    try:
        with zipfile.ZipFile(io.BytesIO(stream.read())) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile:
        return set()
    return {entry for entry in EXPECTED_PRIMITIVE_ENTRIES if entry in names}


def main() -> int:
    args = parse_args()
    archive = args.archive.resolve()
    if not archive.is_file() or archive.stat().st_size == 0:
        raise SystemExit(f"missing or empty Browser archive: {archive}")

    binary_member = None
    found_entries: set[str] = set()
    with tarfile.open(archive, mode="r:xz") as package:
        for member in package.getmembers():
            normalized = member.name.removeprefix("./")
            if normalized.endswith("/zen") and member.isfile() and member.size > 0:
                binary_member = normalized
            if normalized.endswith("/omni.ja") and member.isfile():
                stream = package.extractfile(member)
                if stream is not None:
                    found_entries.update(primitive_entries_in_omnijar(stream))

    if binary_member is None:
        raise SystemExit("packaged Browser archive does not contain a non-empty zen executable")
    missing = sorted(EXPECTED_PRIMITIVE_ENTRIES - found_entries)
    if missing:
        raise SystemExit(f"packaged Browser omni.ja is missing Primitive entries: {missing}")

    metadata = {
        "schema_version": "primitive.browser.artifact/v1",
        "platform": "linux-x86_64",
        "build_commit": os.environ.get("PRIMITIVE_BUILD_SHA", "unknown"),
        "archive": archive.name,
        "size_bytes": archive.stat().st_size,
        "sha256": sha256(archive),
        "executable_member": binary_member,
        "primitive_entries": sorted(found_entries),
    }
    args.output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
