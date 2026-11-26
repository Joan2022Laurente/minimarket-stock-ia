"""Contratos y errores de la orquestación local sin Docker."""

import argparse
import json
import platform
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import candidate  # noqa: E402
from release import (  # noqa: E402
    ARCH, ROOT, Lab, ReleaseError, atomic_json, configuration_digest, digest_bytes,
    digest_file, exclusive_lock, main, overlay, snapshot_files,
)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        cfg = {"owner": "d" * 32, "registry": "127.0.0.1:5000",
               "architecture": f"linux/{ARCH[platform.machine().lower()]}", "schema": "fixture-v1"}
        atomic_json(self.root / "lab.json", cfg)
        env = self.root / "lab.env"
        env.write_text("SECRET_KEY=fixture-aaaaaaaaaaaaaaaa\nGRAFANA_ADMIN_PASSWORD=fixture-bbbbbbbbbbbbbbbb\n", encoding="ascii")
        env.chmod(0o600)
        (self.root / "textfile").mkdir()
        self.lab = Lab(self.root, 90)
        self.snapshot = self.root / "releases/release-a"
        files = {}
        for name in snapshot_files():
            path = self.snapshot / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, path)
            files[name] = digest_file(path)
        name = "deploy/fixture-owner.json"
        atomic_json(self.snapshot / name, overlay(cfg["owner"]))
        files[name] = digest_file(self.snapshot / name)
        self.doc = {
            "id": "release-a", "format": "init008-local-fixture", "architecture": cfg["architecture"], "schema": cfg["schema"],
            "configuration": files, "configuration_sha256": configuration_digest(files),
            "images": {part: f'127.0.0.1:5000/init008/{part}@{digest_bytes(part.encode())}' for part in ("backend", "frontend")},
        }

    def save(self):
        path = self.snapshot / "manifest.json"
        atomic_json(path, self.doc)
        return {"id": "release-a", "digest": digest_file(path)}

    def test_validated_snapshot(self):
        self.assertEqual(self.lab.load(self.save()), self.doc)

    def test_manifest_changed_after_approval(self):
        pointer = self.save()
        self.doc["schema"] = "fixture-v2"
        self.save()
        with self.assertRaisesRegex(ReleaseError, "alterado"):
            self.lab.load(pointer)

    def test_reject_incomplete_manifest(self):
        del self.doc["schema"]
        with self.assertRaisesRegex(ReleaseError, "incompleto"):
            self.lab.load(self.save())

    def test_reject_mutable_foreign_and_malformed_digests(self):
        for ref in ("127.0.0.1:5000/init008/backend:latest", "ghcr.io/test/backend@" + digest_bytes(b"x"),
                    "127.0.0.1:5000/init008/backend@sha256:000"):
            with self.subTest(ref=ref):
                self.doc["images"]["backend"] = ref
                with self.assertRaisesRegex(ReleaseError, "mutable"):
                    self.lab.load(self.save())

    def test_reject_path_traversal(self):
        with self.assertRaisesRegex(ReleaseError, "Puntero"):
            self.lab.load({"id": "../release-a", "digest": self.save()["digest"]})

    def test_reject_architecture(self):
        self.doc["architecture"] = "linux/unknown"
        with self.assertRaisesRegex(ReleaseError, "Arquitectura"):
            self.lab.load(self.save())

    def test_reject_configuration_checksum(self):
        self.doc["configuration_sha256"] = digest_bytes(b"wrong")
        with self.assertRaisesRegex(ReleaseError, "SHA de configuración"):
            self.lab.load(self.save())

    def test_reject_configuration_even_if_rehashed(self):
        path = self.snapshot / "deploy/Caddyfile"
        path.write_text("different", encoding="ascii")
        self.doc["configuration"]["deploy/Caddyfile"] = digest_file(path)
        self.doc["configuration_sha256"] = configuration_digest(self.doc["configuration"])
        with self.assertRaisesRegex(ReleaseError, "perfil local revisado"):
            self.lab.load(self.save())

    def test_reject_unrelated_database_schema(self):
        self.doc["schema"] = "fixture-v2"
        with self.assertRaises(ReleaseError) as error:
            self.lab.load(self.save())
        self.assertEqual(error.exception.code, 3)

    def test_block_production_before_docker(self):
        with patch.object(sys, "argv", ["release.py", "deploy", "--environment", "production", "--apply"]), patch.object(Lab, "docker") as docker:
            self.assertEqual(main(), 3)
            docker.assert_not_called()

    def test_explicit_approval_required(self):
        with patch.object(sys, "argv", ["release.py", "deploy", "--environment", "laboratory", "--root", str(self.root),
                                       "--release", "release-a", "--apply"]), patch.object(Lab, "docker") as docker:
            self.assertEqual(main(), 2)
            docker.assert_not_called()

    def test_reject_corrupt_journal(self):
        self.lab.write_state({"current": self.save(), "previous": None, "pending": {"target": 1}})
        with self.assertRaisesRegex(ReleaseError, "Diario"):
            self.lab.state()

    def test_nonblocking_lock(self):
        path = self.root / "release.lock"
        with exclusive_lock(path):
            with self.assertRaisesRegex(ReleaseError, "lock"):
                with exclusive_lock(path):
                    self.fail("Segundo lock adquirido")
        with exclusive_lock(path):
            self.assertTrue(path.is_file())

    def test_state_atomic_roundtrip(self):
        state = {"current": self.save(), "previous": None, "pending": None}
        self.lab.write_state(state)
        self.assertEqual(json.loads((self.root / "state.json").read_text(encoding="ascii")), state)
        self.assertEqual(set(self.root.iterdir()), {self.root / name for name in ("lab.json", "lab.env", "textfile", "releases", "state.json")})

    def test_rollback_blocks_incompatible_previous_schema(self):
        self.lab.write_state({"current": None, "previous": self.save(), "pending": None})
        self.lab.lab["schema"] = "fixture-v2"
        with patch.object(self.lab, "preflight"), patch.object(self.lab, "activate") as activate:
            with self.assertRaisesRegex(ReleaseError, "Esquema incompatible"):
                self.lab.operate(argparse.Namespace(operation="rollback", recover=False, apply=True))
            activate.assert_not_called()

    def test_failed_recovery_preserves_pending_and_stops_attempts(self):
        current = self.save()
        previous = {"id": "release-b", "digest": digest_bytes(b"other")}
        start = {"current": current, "previous": previous, "pending": None}
        self.lab.write_state(start)
        args = argparse.Namespace(operation="rollback", recover=False, apply=True)
        with patch.object(self.lab, "load", side_effect=[{"id": "release-b"}, {"id": "release-a"}]), \
                patch.object(self.lab, "preflight"), patch.object(self.lab, "inspect_model"), patch.object(self.lab, "images"), \
                patch.object(self.lab, "activate", side_effect=ReleaseError("fixture unhealthy", 4)) as activate:
            with self.assertRaises(ReleaseError) as error:
                self.lab.operate(args)
        self.assertEqual(error.exception.code, 5)
        self.assertEqual(activate.call_count, 2)
        state = self.lab.state()
        self.assertEqual(state["current"], current)
        self.assertEqual(state["pending"]["target"], previous)


class PublishedContractTest(unittest.TestCase):
    def setUp(self):
        source = ROOT / "docs/devops/evidencias/init-006/candidate-local.json"
        self.release = json.loads(source.read_text(encoding="utf-8"))
        self.sha = self.release["git_sha"]
        self.repo = self.release["repository"]
        self.release.update(
            state="published-candidate", registry_verified=True,
            publication={"run_id": 20, "recorded_at": self.release["generated_at"]},
            build={"source": "github-actions", "run_id": 10, "attempt": 1},
            configuration={name: digest_file(ROOT / name) for name in candidate.CONFIG},
        )
        for part in candidate.COMPONENTS:
            self.release[part]["image"] += "-10-1"
        candidate.verify_release(self.release, self.repo, self.sha, "amd64", 20)

    def test_reject_wrong_publish_run(self):
        with self.assertRaisesRegex(ValueError, "run de publicación"):
            candidate.verify_release(self.release, self.repo, self.sha, "amd64", 21)

    def test_reject_other_source_repository(self):
        with self.assertRaisesRegex(ValueError, "repositorio"):
            candidate.verify_release(self.release, "fixture/other", self.sha, "amd64", 20)

    def test_reject_scan_from_another_image(self):
        self.release["scan"]["backend"]["image_config_digest"] = digest_bytes(b"different scanned configuration")
        with self.assertRaisesRegex(ValueError, "Escaneo de otra configuración"):
            candidate.verify_release(self.release, self.repo, self.sha, "amd64", 20)

    def test_reject_promotion_based_on_json_boolean(self):
        self.release["production_approved"] = True
        with self.assertRaisesRegex(ValueError, "candidato publicado"):
            candidate.verify_release(self.release, self.repo, self.sha, "amd64", 20)


if __name__ == "__main__":
    unittest.main()
