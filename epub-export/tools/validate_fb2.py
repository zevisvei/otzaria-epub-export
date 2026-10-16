#!/usr/bin/env python3
"""Validate FB2 files against the official FictionBook 2.0 XSD (gribuser/fb2).
Usage: python3 tools/validate_fb2.py <xsd-dir> file.fb2 [...]   (needs lxml)"""
import sys

from lxml import etree


def main():
    schema = etree.XMLSchema(etree.parse(f'{sys.argv[1]}/FictionBook.xsd'))
    bad = 0
    for path in sys.argv[2:]:
        ok = schema.validate(etree.parse(path))
        print(f"{path.rsplit('/', 1)[-1]}: {'VALID' if ok else 'INVALID'}")
        for err in list(schema.error_log)[:10]:
            print(f'  line {err.line}: {err.message}')
        bad += not ok
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
