#!/usr/bin/env python3
"""Offline delivery boundaries: source identity, closed image manifest and no host builds."""
import copy
import json
import os
import re
import runpy
import subprocess
import tempfile
import textwrap
import unittest
from unittest.mock import patch
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

    def test_container_owned_git_keys_remain_mounted_without_runner_read_access(self):
        with tempfile.TemporaryDirectory() as directory:
            key, hosts = Path(directory) / 'key', Path(directory) / 'known_hosts'
            arguments = ['bash', str(ROOT / 'scripts/delivery-git-mount.sh'), str(key), str(hosts)]
            optional = subprocess.run(arguments, capture_output=True, text=True)
            self.assertEqual(optional.returncode, 0)
            self.assertEqual(optional.stdout, '')
            key.write_text('fixture-only')
            key.chmod(0)
            if os.geteuid() != 0:
                self.assertFalse(os.access(key, os.R_OK))
            incomplete = subprocess.run(arguments, capture_output=True, text=True)
            self.assertEqual(incomplete.returncode, 2)
            hosts.write_text('fixture-only')
            selected = subprocess.run(arguments, capture_output=True, text=True)
            self.assertEqual(selected.returncode, 0)
            self.assertEqual(selected.stdout.strip(), 'deploy/compose.git-secrets.example.yml')
            self.assertEqual(key.stat().st_mode & 0o777, 0)

    def release_python(self, marker):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        match = re.search(r"<<'" + marker + r"'\n(.*?)\n\s*" + marker + r"\n", workflow, re.DOTALL)
        self.assertIsNotNone(match)
        return textwrap.dedent(match.group(1))

    def test_release_preflight_accepts_both_tag_styles_and_rejects_invalid_refs(self):
        code = self.release_python('PYREADY')
        with tempfile.TemporaryDirectory() as directory:
            output = str(Path(directory) / 'output')
            for tag in ['0.21.0', 'v0.21.0', 'v1.0.2']:
                with patch.dict(os.environ, TAG=tag, GITHUB_REPOSITORY='CzarMich/openehr-modelling-assistant', GITHUB_OUTPUT=output), patch('subprocess.run', return_value=subprocess.CompletedProcess([], 1, stderr='HTTP 404')):
                    exec(compile(code, 'release-preflight', 'exec'), {})
            for tag in ['main', 'refs/tags/v1.0.2', 'v1.0.2\n', '$(echo unsafe)']:
                with patch.dict(os.environ, TAG=tag), patch('subprocess.run') as request:
                    with self.assertRaises(SystemExit):
                        exec(compile(code, 'release-preflight', 'exec'), {})
                    request.assert_not_called()

    def test_release_requires_the_tag_source_app_version_including_v_prefix(self):
        code = self.release_python('PYVERSION')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'src'
            source.mkdir()
            (source / 'constants.php').write_text("<?php define('APP_VERSION', '0.21.0');")
            for tag in ['0.21.0', 'v0.21.0']:
                result = subprocess.run(['python3', '-c', code], cwd=directory, env=dict(os.environ, TAG=tag), capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            mismatched = subprocess.run(['python3', '-c', code], cwd=directory, env=dict(os.environ, TAG='v1.0.2'), capture_output=True, text=True)
            self.assertNotEqual(mismatched.returncode, 0)
            self.assertIn('APP_VERSION is 0.21.0', mismatched.stderr)
            self.assertIn('They must match', mismatched.stderr)


if __name__ == '__main__':
    unittest.main()
