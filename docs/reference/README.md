# Reference hierarchy and verification

All four original PNGs are committed in this directory. Run `npm run references:verify` before considering any import. It strictly checks signatures, byte counts, dimensions and SHA-256 against `manifest.json`. Preserve valid references byte-for-byte and keep them outside shipped runtime assets. If verification fails, report the exact mismatch; never change the manifest to accept an incorrect image.

| Path | Role |
| --- | --- |
| city-master.png | Primary eagle-eye city composition/palette; NOT gameplay camera. |
| experiments/godot-attempt.png | Full side-by-side: LEFT rural target, RIGHT user's Godot attempt. |
| experiments/unreal-attempt.png | Earlier Unreal attempt; useful contrast, not an approved target. |
| experiments/blender-attempt.png | Earlier Blender-assisted attempt; useful contrast, not an approved target. |

Images are supplied by the owner for development reference. Creation method/rights are not established here. No automatic redistribution/commercial license is asserted. They are not runtime textures or finished assets.

For an actually missing original, the accompanying `Voxarrium-reference-images.zip` remains a recovery source. `tools/import-references.ps1` reads that archive from Downloads (or an explicit `-ArchivePath`), checks the manifest, rejects unexpected entries, and refuses to overwrite differing files. It does not search unrelated folders. Do not run recovery over already valid references, replace them with thumbnails, or regenerate them. M0 verification passed for the committed originals on 2026-09-28; see `../../STATUS.md` for local evidence.
