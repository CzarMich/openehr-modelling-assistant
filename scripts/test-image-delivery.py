#!/usr/bin/env python3
"""Offline delivery boundaries: source identity, closed image manifest and no host builds."""
import copy
import json
import os
import runpy
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS = runpy.run_path(str(ROOT / 'scripts/delivery-images.py'))
SHA = 'a' * 40


class DeliveryTests(unittest.TestCase):
    def evidence(self, directory):
        for component in FUNCTIONS['COMPONENTS']:
            entry = {'revision': SHA, 'component': component, 'image': FUNCTIONS['PREFIX'] + '-' + component, 'digest': 'sha256:' + 'b' * 64}
            (Path(directory) / f'{component}.json').write_text(json.dumps(entry))

    def test_build_evidence_requires_all_components_and_exact_source(self):
        with tempfile.TemporaryDirectory() as directory:
            self.evidence(directory)
            manifest = FUNCTIONS['assemble'](directory, SHA)
            self.assertEqual(len(manifest['images']), 5)
            with self.assertRaises(ValueError):
                FUNCTIONS['assemble'](directory, 'c' * 40)
            (Path(directory) / 'engine.json').unlink()
            with self.assertRaises(FileNotFoundError):
                FUNCTIONS['assemble'](directory, SHA)

    def test_uploaded_manifest_cannot_inject_registry_tags_components_or_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            self.evidence(directory)
            manifest = FUNCTIONS['assemble'](directory, SHA)
            for image in ['evil.example/app@sha256:' + 'b' * 64, FUNCTIONS['PREFIX'] + '-app:latest', 'https://user:secret@evil.example/image']:
                invalid = copy.deepcopy(manifest)
                invalid['images']['app'] = image
                with self.assertRaises(ValueError):
                    FUNCTIONS['validate'](invalid, SHA)
            invalid = copy.deepcopy(manifest)
            invalid['images']['extra'] = 'injected'
            with self.assertRaises(ValueError):
                FUNCTIONS['validate'](invalid, SHA)
            with self.assertRaises(ValueError):
                FUNCTIONS['validate'](manifest, 'c' * 40)

    def test_compose_eliminates_builds_and_keeps_persistent_volumes(self):
        with tempfile.TemporaryDirectory() as directory:
            self.evidence(directory)
            manifest = FUNCTIONS['assemble'](directory, SHA)
            FUNCTIONS['write_files'](manifest, directory)
            environment = dict(os.environ, MODELLING_ENGINE_KEY_FILE=directory + '/engine-key',
                               MODELLING_STORAGE_SECRET_DIR=directory, MODELLING_CDR_KEY_FILE=directory + '/cdr-key')
            for file in ['engine-key', 'cdr-key', 'governance-password', 'governance-owner-password', 'cache-password', 'cache-signing-key']:
                (Path(directory) / file).write_text('fixture-only')
            arguments = ['docker', 'compose', '-p', 'openehr-modelling-dev', '--env-file', directory + '/images.env', '-f', 'docker-compose.yml']
            for overlay in ['compose.storage.yml', 'compose.engine.yml', 'compose.cdr.yml', 'compose.images.yml', 'compose.engine-images.yml']:
                arguments += ['-f', 'deploy/' + overlay]
            result = subprocess.run(arguments + ['config', '--format', 'json'], cwd=ROOT, env=environment, text=True, capture_output=True, check=True)
            config = json.loads(result.stdout)
            for service in config['services'].values():
                self.assertNotIn('build', service)
            for name in ['app', 'chat', 'ingress', 'engine']:
                self.assertEqual(config['services'][name]['image'], manifest['images'][name])
            self.assertEqual(config['volumes']['models']['name'], 'openehr-modelling-dev_models')
            self.assertEqual(config['volumes']['chat-data']['name'], 'openehr-modelling-dev_chat-data')
            self.assertEqual(config['volumes']['governance-postgres']['name'], 'openehr-modelling-dev_governance-postgres')

    def test_wrong_environment_or_revision_cannot_start_a_deployment(self):
        for args in [('unexpected', SHA), ('production', 'moving-main')]:
            result = subprocess.run(['bash', str(ROOT / 'scripts/deploy-images.sh'), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
