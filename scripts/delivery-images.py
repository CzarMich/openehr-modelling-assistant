#!/usr/bin/env python3
"""Validate build evidence; emit a closed set of digest references for Compose."""
import json
import re
import sys
from pathlib import Path

COMPONENTS = ('app', 'chat', 'reviews', 'ingress', 'engine')
PREFIX = 'ghcr.io/czarmich/openehr-modelling-assistant'


def assemble(directory, revision):
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('A full source revision is required')
    images = {}
    for component in COMPONENTS:
        entry = json.loads((Path(directory) / f'{component}.json').read_text())
        expected = f'{PREFIX}-{component}'
        if entry.get('revision') != revision or entry.get('component') != component or entry.get('image') != expected:
            raise ValueError('Build evidence identity differs from the selected source')
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', entry.get('digest', '')):
            raise ValueError('An immutable image digest is required')
        images[component] = expected + '@' + entry['digest']
    return {'schema': 1, 'repository': 'CzarMich/openehr-modelling-assistant', 'revision': revision, 'images': images}


def validate(manifest, revision):
    if manifest.get('revision') != revision or manifest.get('repository') != 'CzarMich/openehr-modelling-assistant' or manifest.get('schema') != 1:
        raise ValueError('Deployment evidence does not match the selected source')
    if set(manifest.get('images', {})) != set(COMPONENTS):
        raise ValueError('All five build components are required')
    for component, image in manifest['images'].items():
        if not re.fullmatch(re.escape(f'{PREFIX}-{component}@sha256:') + r'[a-f0-9]{64}', image):
            raise ValueError('Unexpected registry, component or mutable image reference')
    return manifest


def write_files(manifest, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'images.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'images.env').write_text(''.join(f'MODELLING_{component.upper()}_IMAGE={image}\n' for component, image in manifest['images'].items()))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: delivery-images.py EVIDENCE_DIRECTORY REVISION OUTPUT_DIRECTORY')
    write_files(assemble(sys.argv[1], sys.argv[2]), sys.argv[3])
