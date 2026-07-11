from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from .models import ImageTo3DOptions, ProviderName


@dataclass(frozen=True)
class GenerationResult:
    path: Path
    media_type: str
    provider: ProviderName
    provider_version: str


class ProviderError(RuntimeError):
    pass


class ImageTo3DProvider(ABC):
    name: ProviderName

    @abstractmethod
    async def generate(self, image_path: Path, output_dir: Path, options: ImageTo3DOptions) -> GenerationResult:
        raise NotImplementedError


async def _run_bounded(command: list[str], timeout_seconds: int) -> None:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
    except TimeoutError as exc:
        process.kill()
        await process.communicate()
        raise ProviderError(f"generation timed out after {timeout_seconds}s") from exc
    if process.returncode != 0:
        detail = (stderr or stdout).decode(errors="replace")[-4000:]
        raise ProviderError(f"provider exited with code {process.returncode}: {detail}")


class TripoSRProvider(ImageTo3DProvider):
    name = ProviderName.TRIPOSR

    def __init__(self, repo_path: Path, timeout_seconds: int = 900) -> None:
        self.repo_path = repo_path
        self.timeout_seconds = timeout_seconds

    async def generate(self, image_path: Path, output_dir: Path, options: ImageTo3DOptions) -> GenerationResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        command = [
            "python",
            str(self.repo_path / "run.py"),
            str(image_path),
            "--output-dir",
            str(output_dir),
            "--model-save-format",
            options.output_format,
            "--mc-resolution",
            str(options.mesh_resolution),
        ]
        if not options.remove_background:
            command.append("--no-remove-bg")
        if options.bake_texture:
            command.extend(["--bake-texture", "--texture-resolution", str(options.texture_resolution)])
        await _run_bounded(command, self.timeout_seconds)
        result_path = output_dir / "0" / f"mesh.{options.output_format}"
        if not result_path.exists():
            raise ProviderError("TripoSR completed without producing the expected mesh")
        media_type = "model/gltf-binary" if options.output_format == "glb" else "model/obj"
        return GenerationResult(result_path, media_type, self.name, "triposr@pinned")


class InstantMeshProvider(ImageTo3DProvider):
    name = ProviderName.INSTANTMESH

    def __init__(self, repo_path: Path, timeout_seconds: int = 1800) -> None:
        self.repo_path = repo_path
        self.timeout_seconds = timeout_seconds

    async def generate(self, image_path: Path, output_dir: Path, options: ImageTo3DOptions) -> GenerationResult:
        if options.output_format != "obj":
            raise ProviderError("InstantMesh adapter currently emits OBJ only")
        output_dir.mkdir(parents=True, exist_ok=True)
        command = [
            "python",
            str(self.repo_path / "run.py"),
            str(self.repo_path / "configs" / "instant-mesh-large.yaml"),
            str(image_path),
            "--output_path",
            str(output_dir),
        ]
        if not options.remove_background:
            command.append("--no_rembg")
        if options.bake_texture:
            command.append("--export_texmap")
        await _run_bounded(command, self.timeout_seconds)
        candidates = list((output_dir / "instant-mesh-large" / "meshes").glob("*.obj"))
        if len(candidates) != 1:
            raise ProviderError("InstantMesh completed without one unambiguous OBJ result")
        return GenerationResult(candidates[0], "model/obj", self.name, "instantmesh@pinned")


def build_providers(triposr_path: Path, instantmesh_path: Path) -> dict[ProviderName, ImageTo3DProvider]:
    return {
        ProviderName.TRIPOSR: TripoSRProvider(triposr_path),
        ProviderName.INSTANTMESH: InstantMeshProvider(instantmesh_path),
    }
