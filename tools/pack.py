#!/usr/bin/env python3
"""Pack the plugin into dist/<id>-<version>.otzplugin (zip with manifest.json at root).

Prefer `otzaria pack-plugin` when Otzaria is installed (it also validates);
this script is a fallback that applies the same default exclusions.
"""
import json
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXCLUDE_DIRS = {'tools', 'dist', '.git', 'node_modules', '.vscode', '.idea', '.claude'}


def main():
    with open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{manifest['id']}-{manifest['version']}.otzplugin")
    count = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith('.'))
            for name in sorted(filenames):
                if name.startswith('.') or name.endswith('.md'):
                    continue
                full = os.path.join(dirpath, name)
                z.write(full, os.path.relpath(full, ROOT).replace(os.sep, '/'))
                count += 1
    print(f'wrote {out} ({count} files, {os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
