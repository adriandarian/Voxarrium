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
    material = bpy.data.materials.new('calibration_neutral')
    material.diffuse_color = (0.62, 0.66, 0.68, 1.0)
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = material.diffuse_color
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = 0.85
    cube.data.materials.append(material)
    # Asymmetric positions establish the axis conversion that a symmetric cube cannot.
    # Blender +X -> glTF +X; Blender +Y -> glTF -Z; Blender +Z -> glTF +Y.
    for axis, position, color in [
        ('x', (1.5, 0, 0), (0.85, 0.12, 0.08, 1.0)),
        ('y', (0, 1.5, 0), (0.15, 0.7, 0.2, 1.0)),
        ('z', (0, 0, 1.5), (0.1, 0.3, 0.9, 1.0)),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=0.18, location=position)
        marker = bpy.context.object
        marker.name = 'axis_blender_' + axis
        marker['asset_id'] = 'diagnostics.axis.' + axis
        axis_material = bpy.data.materials.new('axis_' + axis)
        axis_material.diffuse_color = color
        axis_material.use_nodes = True
        axis_material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color
        axis_material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = 0.85
        marker.data.materials.append(axis_material)
    bpy.ops.object.select_all(action='SELECT')
    os.makedirs(os.path.dirname(output), exist_ok=True)
    result = bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_animations=False)
    if 'FINISHED' not in result or not os.path.isfile(output):
        raise RuntimeError('GLB export failed')
    print('VOXARRIUM_FIXTURE: exported one-meter cube and axis markers; validate them in the runtime')


if __name__ == '__main__':
    main()
