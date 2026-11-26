"""Pruebas sin AWS ni llamadas de red. Los estados de publicación son fixtures."""

import contextlib
import copy
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "deploy/scripts"))

import candidate
import ec2_preflight as preflight


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads(preflight.EXAMPLE.read_text(encoding="utf-8"))
        self.results = preflight.Results()
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def test_example_is_pending(self):
        self.assertTrue(preflight.validate_contract(self.doc, self.results))
        self.assertEqual(self.results.exit_code(), 3)

    def test_unsafe_ingress_fails(self):
        self.doc["network"]["lab_ingress"] = [{"protocol": "tcp", "port": 3000, "source": "0.0.0.0/0"}]
        self.assertFalse(preflight.validate_contract(self.doc, self.results))
        self.assertEqual(self.results.exit_code(), 1)

    def test_subnet_outside_vpc_fails(self):
        self.doc["network"].update(vpc_cidr="10.0.0.0/16", subnet_cidr="10.1.0.0/24")
        self.assertFalse(preflight.validate_contract(self.doc, self.results))

    def test_default_contract_only_does_not_call_network(self):
        with (
            patch.object(sys, "argv", ["ec2-preflight", "--contract-only"]),
            patch.object(preflight, "imds_request") as imds,
            patch.object(preflight, "check_supabase") as postgres,
        ):
            self.assertEqual(preflight.main(), 3)
        imds.assert_not_called()
        postgres.assert_not_called()

    def test_nonloopback_monitoring_port_fails(self):
        with patch.object(preflight, "command", return_value="LISTEN 0 100 0.0.0.0:3000 0.0.0.0:*"):
            preflight.inspect_ports(self.results)
        self.assertEqual(self.results.exit_code(), 1)

    def test_imds_uses_only_identity_and_profile_metadata(self):
        self.doc["aws"]["region"] = "fixture"
        self.doc["access"]["instance_profile_arn"] = "fixture-role"
        self.doc["ec2"].update(instance_id="fixture-instance", instance_type="fixture-type",
                               ami_id="fixture-image", architecture="arm64")
        identity = {"instanceId": "fixture-instance", "instanceType": "fixture-type", "imageId": "fixture-image",
                    "region": "fixture", "architecture": "arm64"}
        with patch.object(preflight, "imds_request", side_effect=[
            b"fixture-session", json.dumps(identity).encode(), b'{"InstanceProfileArn":"fixture-role"}'
        ]) as imds:
            preflight.check_identity(self.doc, self.results)
        self.assertEqual([call.args[:2] for call in imds.call_args_list], [
            ("PUT", "/latest/api/token"),
            ("GET", "/latest/dynamic/instance-identity/document"),
            ("GET", "/latest/meta-data/iam/info"),
        ])
        self.assertEqual(self.results.exit_code(), 0)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        source = ROOT / "docs/devops/evidencias/init-006/candidate-local.json"
        self.local = json.loads(source.read_text(encoding="utf-8"))
        self.release = copy.deepcopy(self.local)
        self.release.update(
            state="published-candidate", registry_verified=True,
            publication={"run_id": 1, "recorded_at": self.local["generated_at"]},
            build={"source": "github-actions", "run_id": 1, "attempt": 1},
        )
        for component in candidate.COMPONENTS:
            self.release[component]["image"] += "-1-1"
        self.release["configuration"] = {file: candidate.digest_file(ROOT / file) for file in candidate.CONFIG}
        self.args = (self.local["repository"], self.local["git_sha"], "amd64", 1)

    def test_local_candidate_cannot_be_used_as_release(self):
        with self.assertRaisesRegex(ValueError, "publicado"):
            candidate.verify_release(self.local, *self.args)

    def test_fixture_resolves_immutable_references(self):
        refs = candidate.verify_release(self.release, *self.args)
        self.assertTrue(refs["BACKEND_IMAGE"].endswith("@" + self.release["backend"]["digest"]))
        self.assertTrue(refs["FRONTEND_IMAGE"].endswith("@" + self.release["frontend"]["digest"]))

    def test_wrong_architecture_rejected(self):
        with self.assertRaisesRegex(ValueError, "arquitectura"):
            candidate.verify_release(self.release, *self.args[:2], "arm64", 1)

    def test_critical_rejected(self):
        self.release["scan"]["backend"]["severity"]["CRITICAL"] = 1
        with self.assertRaisesRegex(ValueError, "CRITICAL"):
            candidate.verify_release(self.release, *self.args)

    def test_production_gate_does_not_read_candidate(self):
        result = subprocess.run([
            sys.executable, str(ROOT / "deploy/scripts/candidate.py"), "verify-release", "absent.json",
            "--repository", self.args[0], "--sha", self.args[1], "--arch", "amd64", "--publish-run", "1",
            "--purpose", "production",
        ], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 3)
        self.assertIn("INIT-001", result.stderr)


if __name__ == "__main__":
    unittest.main()
