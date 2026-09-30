"""M4 reusable meter-scale architecture. Dedicated background factory session.

The accepted rural generator supplies carpentry/opening/tile construction helpers;
no rural export or source file is modified. Runtime coordinates are +Y up, +Z front.
Every module retains its own origin, semantic parts and original material colors.
"""
import argparse
import hashlib
import json
import math
import os
import sys
from collections import defaultdict

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(__file__))
import rural_hero as h


def setup():
    h.palette()
    # Neutral pigment families accept authored per-building colors at runtime.
    for name, color in [('plaster_lime', 0xFFFFFF), ('plaster_warm', 0xEAE3D3),
                        ('cloth_cream', 0xE3D3AC), ('cloth_color', 0xFFFFFF),
                        ('window_warm', 0x977D51), ('produce_ochre', 0xC3973E),
                        ('produce_green', 0x73824A), ('produce_red', 0xA55035)]:
        h.material(name, color)
    for name, color in [('terracotta_umber', 0xB5AAA1), ('terracotta_russet', 0xD0C1AE),
                        ('terracotta_warm', 0xE0D2BA), ('terracotta_lit', 0xEBDAC0),
                        ('terracotta_aged', 0xC2BAA2), ('terracotta_ridge', 0xE6D0B2)]:
        h.material(name, color)
    for name in ['window_glass', 'window_glint', 'window_warm']:
        node = h.MATERIALS[name].node_tree.nodes.get('Principled BSDF')
        node.inputs['Emission Color'].default_value = (0.32, 0.15, 0.035, 1)
        node.inputs['Emission Strength'].default_value = 0


def box(asset, mat, center, size, part='body'):
    h.box(asset, part, mat, center, size)


def panel_modules():
    box('wall', 'plaster_lime', (0, .5, -.12), (1, 1, .24), 'continuous_plaster')
    box('stone', 'stone_aged', (0, .5, 0), (1, 1, 1), 'stone_block')
    box('post', 'timber_structure', (0, .5, 0), (.18, 1, .18), 'upright')
    box('beam', 'timber_endgrain', (0, 0, 0), (1, .18, .20), 'horizontal')
    h.beam('brace', 'joinery', 'timber_structure', (-.5, 0, 0), (.5, 1, 0), .115, .14)
    h.window('window', dict(u=0, y=0, w=1.05, h=1.32, shutters=False), (0, 1), (1, 0), 0)
    # Independent hinge origin permits held-open, angled and closed leaves.
    for plank in range(4):
        box('shutter', 'door_oak_light', (.06+plank*.12,.66,.018),(.113,1.32,.045),'boards')
    for y in (.22,1.08):
        box('shutter','timber_structure',(.24,y,.054),(.48,.07,.045),'ledges')
        box('shutter','iron_aged',(.065,y,.083),(.10,.035,.018),'hinges')
    h.window('shop-window', dict(u=0, y=0, w=1.88, h=1.47, shutters=False), (0, 1), (1, 0), 0)
    h.door('door', dict(u=0, y=0, w=1.18, h=2.16), (0, 1), (1, 0), 0)
    # One tread: top exactly .18m, front .545m, posterior overlaps the wall.
    box('doorstep', 'stone_light', (0, .09, .22), (1.56, .18, .65), 'threshold')
    box('stair', 'stone_aged', (0, .09, 0), (1, .18, .30), 'worn_tread')
    # Gable end cap is independent, sealed and fully framed on both sides.
    h.gable('gable-cap', 0, 8, 0, 2.2, .24)
    for side in (-1, 1):
        h.beam('gable-cap', 'raking_frame', 'timber_structure', (side*4, .02, .15),
               (0, 2.21, .15), .16, .20)
    box('gable-cap', 'timber_endgrain', (0, .04, .15), (8.12, .20, .23), 'tie')
    h.beam('gable-cap', 'kingpost', 'timber_structure', (0, 0, .15), (0, 2.12, .15), .16, .19)


def roof_surface(asset, points, rows, columns):
    """Thick pitched surface with overlapping, gently cambered clay courses."""
    # bilinear patch corners: lower left, lower right, upper right, upper left
    def p(u, v):
        a = [points[0][i]*(1-u)+points[1][i]*u for i in range(3)]
        b = [points[3][i]*(1-u)+points[2][i]*u for i in range(3)]
        return tuple(a[i]*(1-v)+b[i]*v for i in range(3))
    verts = points+[tuple((q[0], q[1]-.16, q[2])) for q in points]
    h.mesh(asset, 'thick_roof_underlay', 'timber_structure', verts,
           [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    palette = ['terracotta_umber','terracotta_russet','terracotta_warm','terracotta_lit','terracotta_aged']
    for row in range(rows):
        for column in range(columns):
            u0, u1 = column/columns+.004, (column+1)/columns-.004
            v0, v1 = row/rows, min(1, (row+1.18)/rows)
            vertices = []
            for drop in (0, -.045):
                for v in (v0, v1):
                    for k in range(5):
                        q = p(u0+(u1-u0)*k/4, v)
                        vertices.append((q[0],q[1]+.035+math.sin(math.pi*k/4)*.055+drop,q[2]))
            faces = []
            for k in range(4):
                faces += [(k,k+1,k+6,k+5),(k+10,k+15,k+16,k+11),
                          (k,k+10,k+11,k+1),(k+5,k+6,k+16,k+15)]
            faces += [(0,5,15,10),(4,14,19,9)]
            mat = palette[(row*3+column+column//3)%5]
            h.mesh(asset,'overlapping_clay_courses',mat,vertices,faces)
    for a,b in zip(points,points[1:]+points[:1]):
        h.beam(asset,'roof_edges','timber_endgrain',a,b,.18,.21)


def roofs():
    # Canonical body 8x7m: overhang 0.65m sides, 1m at entrances/rears.
    h.roof('roof-gable', 4.65, 4.50, 0, 2.2)
    w,d,r = 4.65,4.5,1.1
    for sign in (-1,1):
        roof_surface('roof-hip', [(-w,0,sign*d),(w,0,sign*d),(r,2.2,0),(-r,2.2,0)], 7,19)
        roof_surface('roof-hip', [(sign*w,0,-d),(sign*w,0,d),(sign*r,2.2,0),(sign*r,2.2,0)], 7,17)
    h.beam('roof-hip','ridge','terracotta_ridge',(-r,2.24,0),(r,2.24,0),.28,.23)
    # Steep lower skirt, gentler upper slopes and raised seam conceal no missing sides.
    wi,di = 2.95,2.8
    for sign in (-1,1):
        roof_surface('roof-mansard',[(-w,0,sign*d),(w,0,sign*d),(wi,1.62,sign*di),(-wi,1.62,sign*di)],6,19)
        roof_surface('roof-mansard',[(sign*w,0,-d),(sign*w,0,d),(sign*wi,1.62,di),(sign*wi,1.62,-di)],6,18)
        roof_surface('roof-mansard',[(-wi,1.62,sign*di),(wi,1.62,sign*di),(1,2.2,0),(-1,2.2,0)],4,13)
        roof_surface('roof-mansard',[(sign*wi,1.62,-di),(sign*wi,1.62,di),(sign*1,2.2,0),(sign*1,2.2,0)],4,12)
    h.beam('roof-mansard','ridge','terracotta_ridge',(-1,2.24,0),(1,2.24,0),.28,.22)


def attachments():
    box('chimney','stone_shadow',(0,.82,0),(.72,1.64,.76),'mortar')
    for row in range(8):
        for side in (-1,1):
            for column in (-1,1):
                box('chimney','stone_aged' if row%3 else 'stone_light',
                    (column*.18,.11+row*.20,side*.39),(.34,.18,.075),'courses')
                box('chimney','stone_aged',(side*.37,.11+row*.20,column*.19),(.075,.18,.36),'courses')
    box('chimney','stone_light',(0,1.69,0),(.92,.18,.96),'cap')
    box('chimney','recess_shadow',(0,1.791,0),(.55,.022,.60),'open_flue')
    for x,z,sx,sz in [(-.35,0,.14,.80),(.35,0,.14,.80),(0,-.34,.56,.14),(0,.34,.56,.14)]:
        box('chimney','stone_aged',(x,1.83,z),(sx,.16,sz),'flue_rim')
    for i in range(8):
        box('balcony','timber_worn',(-1.3+(i+.5)*.325,-.065,.60),(.312,.13,1.32),'deck_planks')
    for x in (-1.23,1.23):
        h.beam('balcony','corbels','timber_structure',(x,-.64,.04),(x,-.10,1.18),.14,.19)
    for x in [-1.23,0,1.23]:
        box('balcony','timber_structure',(x,.49,1.22),(.12,1.06,.12),'posts')
    for y in (.22,1.02):
        box('balcony','timber_endgrain',(0,y,1.22),(2.70,.11,.13),'rails')
        for x in (-1.23,1.23):
            box('balcony','timber_endgrain',(x,y,.66),(.11,.11,1.20),'side_rails')
    for i in range(9):
        box('balcony','iron_aged',(-1.14+i*.285,.62,1.22),(.045,.73,.045),'balusters')
    for x in (-1,0,1):
        box('railing','timber_structure',(x,.5,0),(.12,1.08,.12),'posts')
    for y in (.22,1.02):
        box('railing','timber_endgrain',(0,y,0),(2.14,.12,.15),'rails')
    for i in range(7):
        box('railing','iron_aged',(-.85+i*.285,.62,0),(.035,.74,.035),'balusters')
    for stripe in range(8):
        x0,x1 = -1.5+stripe*.375,-1.5+(stripe+1)*.375
        h.mesh('awning','canvas','cloth_color' if stripe%2 else 'cloth_cream',
               [(x0,.18,0),(x1,.18,0),(x1,0,1.26),(x0,0,1.26),
                (x0,-.16,1.26),(x1,-.16,1.26)],[(0,1,2,3),(3,2,5,4)])
    for x in (-1.38,1.38):
        h.beam('awning','braces','timber_structure',(x,-.65,.02),(x,0,1.24),.09,.12)
    box('awning','timber_endgrain',(0,-.04,1.27),(3.12,.10,.10),'brow')
    box('sign','timber_worn',(0,-.52,.61),(.96,.65,.095),'board')
    for x in (-.52,.52):
        box('sign','timber_structure',(x,-.52,.61),(.08,.75,.13),'frame')
    for y in (-.88,-.16):
        box('sign','timber_structure',(0,y,.61),(1.10,.08,.13),'frame')
    box('sign','iron_aged',(0,0,.43),(.065,.06,.95),'bracket')
    for x in (-.31,.31):
        h.cylinder('sign','chains','iron_aged',(x,-.16,.61),(x,0,.61),.018,6)
    h.cylinder('sign','authored_emblem','brass_worn',(0,-.5,.67),(0,-.5,.69),.21,16)
    # Lantern includes bracket, cap, glass body and solid feet on every side.
    box('lantern','iron_aged',(0,.49,.21),(.06,.06,.54),'bracket')
    box('lantern','window_warm',(0,.12,.45),(.21,.34,.21),'glass')
    for x in (-.13,.13):
        for z in (.32,.58):
            box('lantern','iron_aged',(x,.13,z),(.025,.39,.025),'frame')
    box('lantern','iron_aged',(0,.35,.45),(.34,.08,.34),'cap')
    box('lantern','brass_worn',(0,-.10,.45),(.29,.07,.29),'foot')


def market():
    h.barrel('barrel',(0,0,0),.37,.82)
    for x in (-.47,.47):
        for z in (-.34,.34):
            box('crate','timber_structure',(x,.34,z),(.075,.70,.075),'posts')
    for i in range(4):
        for z in (-.35,.35):
            box('crate','timber_worn',(0,.09+i*.17,z),(.95,.13,.055),'slats')
        for x in (-.48,.48):
            box('crate','door_oak_light',(x,.09+i*.17,0),(.055,.13,.68),'slats')
    box('crate','timber_endgrain',(0,.035,0),(.94,.07,.68),'bottom')
    for x in (-1.22,1.22):
        for z in (-.69,.69):
            box('stall','timber_structure',(x,1.17,z),(.11,2.34,.11),'uprights')
    box('stall','timber_worn',(0,.88,.03),(2.62,.12,1.52),'counter')
    for i in range(10):
        box('stall','door_oak_light' if i%3 else 'timber_worn',(-1.25+i*.277,.46,.73),(.25,.75,.065),'front_boards')
    for stripe in range(8):
        x0,x1 = -1.49+stripe*.3725,-1.49+(stripe+1)*.3725
        h.mesh('stall','canvas_roof','cloth_color' if stripe%2 else 'cloth_cream',
            [(x0,2.36,-1),(x1,2.36,-1),(x1,2.64,0),(x0,2.64,0),
             (x0,2.36,1),(x1,2.36,1),(x0,2.14,1),(x1,2.14,1)],
            [(0,1,2,3),(3,2,5,4),(4,5,7,6)])
    for z in (-1,0,1):
        box('stall','timber_endgrain',(0,2.34 if z else 2.60,z),(3.02,.10,.10),'roof_rails')
    for tray in range(3):
        x = -.82+tray*.82
        box('goods-produce','timber_endgrain',(x,.055,.1),(.70,.11,.79),'trays')
        for i in range(9):
            mat = ['produce_green','produce_ochre','produce_red'][tray]
            h.cylinder('goods-produce','fruit',mat,(x-.24+(i%3)*.24,.10,-.13+(i//3)*.22),
                       (x-.24+(i%3)*.24,.24,-.13+(i//3)*.22),.095,8,.075)
    for i in range(9):
        x,z=-.91+(i%3)*.68,-.32+(i//3)*.30
        h.cylinder('goods-bread','loaves','produce_ochre',(x,.06,z),(x,.22,z),.16,10,.13)
        for cut in (-.06,.06):
            box('goods-bread','cloth_cream',(x+cut,.228,z),(.025,.01,.17),'scoring')
    for i in range(7):
        x,z=-.94+(i%4)*.61,-.27+(i//4)*.52
        h.cylinder('goods-pottery','pots','terracotta_warm',(x,.03,z),(x,.24,z),.18,12,.12)
        h.cylinder('goods-pottery','neck','terracotta_aged',(x,.24,z),(x,.38,z),.09,12,.11)
        h.cylinder('goods-pottery','mouth','recess_shadow',(x,.385,z),(x,.393,z),.075,12)
    for i in range(3):
        x=-.85+i*.82
        for layer in range(3):
            box('goods-textiles','cloth_color' if i%2 else 'cloth_cream',
                (x,.055+layer*.09,0),(.69-layer*.035,.082,.73),'folded_bolts')
        box('goods-textiles','timber_structure',(x,.33,.04),(.065,.02,.68),'ties')
    # Tapered basket, open rim and crossed handles; no textured billboards.
    h.cylinder('basket','woven_body','cloth_cream',(0,.02,0),(0,.39,0),.24,14,.35)
    h.cylinder('basket','inside','recess_shadow',(0,.392,0),(0,.4,0),.30,14)
    for i in range(14):
        angle=i/14*math.tau
        h.beam('basket','weave','timber_worn',(.24*math.cos(angle),.06,.24*math.sin(angle)),
               (.35*math.cos(angle),.39,.35*math.sin(angle)),.026,.025)
    for z in (-.24,.24):
        box('basket','timber_endgrain',(0,.47,z),(.42,.045,.035),'handles')
    for x in (-.82,.82):
        box('bench','timber_structure',(x,.24,0),(.16,.48,.61),'feet')
        box('bench','timber_structure',(x,.65,.26),(.10,.87,.10),'back_posts')
    for z in (-.23,0,.23):
        box('bench','timber_worn',(0,.48,z),(2.16,.11,.215),'seat')
    for y in (.74,.94):
        box('bench','timber_worn',(0,y,.29),(2.16,.14,.09),'back')
    box('mooring','timber_structure',(0,.39,0),(.27,.78,.27),'post')
    box('mooring','iron_aged',(0,.67,0),(.34,.06,.34),'collar')
    h.cylinder('mooring','rope','cloth_cream',(-.23,.45,0),(.23,.45,0),.045,8)


def civic_tower():
    for n,t,d,l in [((0,1),(1,0),2,4),((0,-1),(1,0),2,4),((1,0),(0,1),2,4),((-1,0),(0,1),2,4)]:
        h.wall_with_openings('tower',n,t,d,l,0,3.1,
            [dict(kind='window',u=0,y=.85,w=.88,h=1.56,shutters=False)])
    for x in (-1.89,1.89):
        for z in (-1.89,1.89):
            box('tower','stone_light',(x,2.76,z),(.42,5.52,.42),'corner_piers')
    for y in (.12,3.04,5.36):
        box('tower','stone_light',(0,y,0),(4.5,.23,4.5),'belt_courses')
    # Open belfry has real voids, transverse frame and bell rather than dark decals.
    for z in (-1.98,1.98):
        box('tower','timber_structure',(0,5.09,z),(4.12,.27,.28),'belfry_headers')
    for x in (-1.98,1.98):
        box('tower','timber_structure',(x,5.09,0),(.28,.27,4.12),'belfry_headers')
    h.cylinder('tower','bell','brass_worn',(0,3.91,0),(0,4.60,0),.70,16,.35)
    h.cylinder('tower','clapper','iron_aged',(0,3.65,0),(0,4.12,0),.065,8)
    box('tower','timber_structure',(0,4.84,0),(2.25,.20,.20),'bell_yoke')
    # Four sloping roof faces with tiles and a pointed bronze finial.
    for sign in (-1,1):
        roof_surface('tower', [(-2.54,5.40,sign*2.54),(2.54,5.40,sign*2.54),(.20,7.60,0),(-.20,7.60,0)],6,11)
        roof_surface('tower', [(sign*2.54,5.40,-2.54),(sign*2.54,5.40,2.54),(sign*.20,7.60,0),(sign*.20,7.60,0)],6,11)
    h.cylinder('tower','finial','brass_worn',(0,7.60,0),(0,8.17,0),.12,10,.02)


def export(args):
    collections = {}
    for (module,part,mat),data in h.PARTS.items():
        if module not in collections:
            collection = bpy.data.collections.new('district_'+module)
            bpy.context.scene.collection.children.link(collection)
            collections[module] = collection
        geometry = bpy.data.meshes.new(module+'_'+part+'_'+mat)
        geometry.from_pydata([h.to_blender(v) for v in data['vertices']],[],data['faces'])
        geometry.update()
        bm = bmesh.new(); bm.from_mesh(geometry)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(geometry); bm.free()
        obj = bpy.data.objects.new(geometry.name,geometry)
        collections[module].objects.link(obj)
        geometry.materials.append(h.MATERIALS[mat])
        obj['part'] = part; obj['module_id'] = module; obj['units'] = 'meters'
        if part not in ['continuous_plaster','canvas','canvas_roof','overlapping_clay_courses','clay_roof_courses','ridge_caps','window_glazing','gable_plaster']:
            bevel = obj.modifiers.new('worn_edges','BEVEL'); bevel.width=.009; bevel.segments=1
            bevel.limit_method='ANGLE'; bevel.angle_limit=.65
    modules,joined = [],[]
    for module,collection in collections.items():
        objects = list(collection.objects)
        entry = h.asset_report(module,objects); entry['id']='district.module.'+module
        entry['origin']='module-local snap origin; +Y up, front +Z'
        entry['collision']='Parent-authored simplified district proxies; decorations noncolliding'
        entry['lod']='Shared module geometry, conventional instancing; no distance LOD'
        modules.append(entry)
        exported = h.joined_export_objects(module,objects,entry['partBounds'])
        for obj in exported:
            obj['module_id'] = module; obj['asset_id']='district.kit'
            obj.name = 'district_'+module+'_'+obj.material_slots[0].material.name
        joined += exported
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined: obj.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    os.makedirs(args.output_dir,exist_ok=True); os.makedirs(os.path.dirname(args.source),exist_ok=True)
    output=os.path.join(args.output_dir,'district-kit.glb')
    result=bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',use_selection=True,
        export_yup=True,export_extras=True,export_animations=False,export_apply=True,export_materials='EXPORT')
    if 'FINISHED' not in result: raise RuntimeError('District kit export failed')
    for obj in joined: bpy.data.objects.remove(obj,do_unlink=True)
    for data in list(bpy.data.meshes):
        if data.users==0: bpy.data.meshes.remove(data)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.source))
    with open(output,'rb') as file: blob=file.read()
    report={'schemaVersion':1,'blenderVersion':bpy.app.version_string,'seed':h.SEED,
        'source':'assets/source/district-kit.blend','generator':'tools/blender/district_kit.py',
        'provenance':'Original local project-authored geometry; accepted rural helper construction; no downloaded/paid assets or image sampling',
        'license':'Project license unassigned; no third-party source content',
        'assumptions':['Canonical 8x7m roof bodies resize coherently; streets and unseen elevations are authored interpretations.',
                       'M4.1 adds hinge-origin shutters and authored bakery, pottery, produce and textile goods; stalls retain the M4 foundations.',
                       'Closed doors and recessed glazing are full geometry; no explorable interiors are claimed.',
                       'Belfry, guild emblem and market goods are invented coherent street-level details.'],
        'assets':[{'id':'district.kit','path':'public/assets/district/district-kit.glb','sha256':hashlib.sha256(blob).hexdigest(),
                   'bytes':len(blob),'units':'meters','moduleCount':len(modules),'triangles':sum(m['triangles'] for m in modules),
                   'textures':0,'axisConvention':'Blender X/Y/Z -> glTF X/-Z/Y; front +Z; no runtime correction',
                   'collision':'Simplified runtime boxes and stair/bridge proxies owned by parent',
                   'lod':'Shared module/material instance batches; no distance LOD','modules':modules}],
        'preview':'Actual runtime all-side captures by parent are required; export is not owner art approval'}
    os.makedirs(os.path.dirname(args.report),exist_ok=True)
    with open(args.report,'w',encoding='utf-8') as file: json.dump(report,file,indent=2);file.write('\n')
    print('VOXARRIUM_DISTRICT: exported',len(modules),'reusable modules in dedicated GLB; runtime inspection remains separate.')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output-dir',required=True)
    parser.add_argument('--source',required=True);parser.add_argument('--report',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    setup();panel_modules();roofs();attachments();market();civic_tower();export(args)


if __name__=='__main__': main()
