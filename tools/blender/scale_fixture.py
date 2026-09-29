"""Isolated calibration export. Run only through the background fixture launcher."""
import argparse
import os
import sys
import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    output = os.path.abspath(args.output)
    if not output.lower().endswith('.glb'):
        raise ValueError('Output must be a .glb file')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.5))
    cube = bpy.context.object
    cube.name = 'fixture_cube_1m'
    cube['asset_id'] = 'diagnostics.scale-cube'
    cube['purpose'] = 'one-meter pipeline calibration; not final game art'
    assert all(abs(d - 1.0) < 1e-6 for d in cube.dimensions), 'Cube must be one meter on every axis'
    os.makedirs(os.path.dirname(output), exist_ok=True)
    result = bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_animations=False)
    if 'FINISHED' not in result or not os.path.isfile(output):
        raise RuntimeError('GLB export failed')
    print('VOXARRIUM_FIXTURE: exported one-meter cube; runtime axis validation is still required')


if __name__ == '__main__':
    main()
