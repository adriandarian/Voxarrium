# Reference hierarchy and import

The accompanying `Voxarrium-reference-images.zip` preserves four user-provided PNGs byte-for-byte. Import with `tools/import-references.ps1`; it checks the manifest, rejects unexpected archive entries, verifies SHA-256/dimensions and refuses to overwrite differing files. `npm run references:verify` is strict. After successful local import, commit the originals on the working branch; do not stage unrelated work.

| Path | Role |
| --- | --- |
| city-master.png | Primary eagle-eye city composition/palette; NOT gameplay camera. |
| experiments/godot-attempt.png | Full side-by-side: LEFT rural target, RIGHT user's Godot attempt. |
| experiments/unreal-attempt.png | Earlier Unreal attempt; useful contrast, not an approved target. |
| experiments/blender-attempt.png | Earlier Blender-assisted attempt; useful contrast, not an approved target. |

Images are supplied by the owner for development reference. Creation method/rights are not established here. No automatic redistribution/commercial license is asserted. They are not runtime textures or finished assets.

The initial connector-based bootstrap does not contain the original PNG binaries. Do not pretend the missing files are present; complete the local import gate before visual work. A ZIP is used instead of lowering resolution or substituting thumbnails.
