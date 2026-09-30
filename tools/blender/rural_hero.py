"""Voxarrium M2 hero art. Run in a dedicated factory-startup Blender process.

All construction coordinates below are runtime meters (+Y up, front +Z).
to_blender() performs the single documented axis conversion at mesh creation.
Original project-authored geometry; reference images are neither embedded nor baked.
"""
import argparse
import hashlib
import json
import math
import os
import random
import sys
from collections import defaultdict

import bpy
import bmesh
from mathutils import Vector

SEED = 104729
RNG = random.Random(SEED)
PARTS = defaultdict(lambda: {'vertices': [], 'faces': []})
MATERIALS = {}


def linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def material(name, color, roughness=0.85, metallic=0):
    mat = bpy.data.materials.new(name)
    rgb = tuple(linear(((color >> s) & 255) / 255) for s in (16, 8, 0))
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metallic
    MATERIALS[name] = mat


def palette():
    colors = {
        'plaster_lime': 0xDED0A4, 'plaster_warm': 0xD2C295,
        'plaster_repair': 0xB9B18B, 'timber_structure': 0x4C3626,
        'timber_endgrain': 0x745338, 'timber_worn': 0x8E704A,
        'door_oak': 0x705138, 'door_oak_light': 0x846344,
        'stone_shadow': 0x64624F, 'stone_aged': 0x827C62,
        'stone_light': 0x9B9474, 'stone_moss': 0x71774E,
        'terracotta_umber': 0x884527, 'terracotta_russet': 0xA9512B,
        'terracotta_warm': 0xB96033, 'terracotta_lit': 0xC47646,
        'terracotta_aged': 0x995335, 'terracotta_ridge': 0xBC693A,
        'recess_shadow': 0x252D25, 'window_glass': 0x425E58,
        'window_glint': 0x728F7F, 'iron_aged': 0x343D35,
        'brass_worn': 0xAA8242, 'teal_deep': 0x245856,
        'teal_tile': 0x2F7370, 'teal_faded': 0x47817A,
        'bridge_oak': 0x826340, 'bridge_oak_light': 0x9F7C4E,
        'bridge_oak_dark': 0x665138, 'hoop_iron': 0x4D5043,
    }
    for name, color in colors.items():
        material(name, color, 0.5 if name.startswith('window_') else 0.84,
                 0.3 if name in ('iron_aged', 'brass_worn', 'hoop_iron') else 0)


def mesh(asset, group, mat, vertices, faces):
    part = PARTS[(asset, group, mat)]
    offset = len(part['vertices'])
    part['vertices'].extend(vertices)
    part['faces'].extend(tuple(i + offset for i in face) for face in faces)


def box(asset, group, mat, center, dimensions, angle=0):
    cx, cy, cz = center
    sx, sy, sz = (d / 2 for d in dimensions)
    c, s = math.cos(angle), math.sin(angle)
    vertices = []
    for x, y, z in [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
                    (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]:
        vertices.append((cx + x*c + z*s, cy + y, cz - x*s + z*c))
    mesh(asset, group, mat, vertices,
         [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)])


def beam(asset, group, mat, a, b, width, depth=None):
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    reference = Vector((0, 0, 1)) if abs(axis.z) < 0.95 else Vector((0, 1, 0))
    u = axis.cross(reference).normalized() * width / 2
    v = axis.cross(u).normalized() * (depth or width) / 2
    verts = [tuple(p + su*u + sv*v) for p in (a, b) for su, sv in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    mesh(asset, group, mat, verts,
         [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)])


def cylinder(asset, group, mat, a, b, radius, sides=10, radius_end=None):
    a, b = Vector(a), Vector(b)
    axis = (b-a).normalized()
    reference = Vector((0, 0, 1)) if abs(axis.z) < .95 else Vector((0, 1, 0))
    u = axis.cross(reference).normalized()
    v = axis.cross(u).normalized()
    verts = []
    for p, r in [(a, radius), (b, radius if radius_end is None else radius_end)]:
        for i in range(sides):
            angle = 2*math.pi*i/sides
            verts.append(tuple(p + r*(math.cos(angle)*u + math.sin(angle)*v)))
    faces = [tuple(reversed(range(sides))), tuple(range(sides, 2*sides))]
    faces += [(i, (i+1) % sides, (i+1) % sides+sides, i+sides) for i in range(sides)]
    mesh(asset, group, mat, verts, faces)


def wall_point(u, y, offset, normal, tangent, distance):
    return (normal[0]*(distance+offset)+tangent[0]*u, y,
            normal[1]*(distance+offset)+tangent[1]*u)


def wall_box(asset, group, mat, u, y, offset, width, height, depth, normal, tangent, distance):
    center = wall_point(u, y, offset, normal, tangent, distance)
    dims = (width, height, depth) if tangent[0] else (depth, height, width)
    box(asset, group, mat, center, dims)


def wall_with_openings(asset, normal, tangent, distance, length, bottom, top, openings):
    # Partition plaster into quads around actual opening voids. Shadow glazing or
    # a closed wooden leaf is recessed into the void, never pasted onto a solid wall.
    us = sorted(set([-length/2, length/2] + [v for o in openings for v in (o['u']-o['w']/2, o['u']+o['w']/2)]))
    ys = sorted(set([bottom, top] + [v for o in openings for v in (o['y'], o['y']+o['h'])]))
    for a, b in zip(us, us[1:]):
        for lo, hi in zip(ys, ys[1:]):
            u, y = (a+b)/2, (lo+hi)/2
            if any(abs(u-o['u']) < o['w']/2 and o['y'] < y < o['y']+o['h'] for o in openings):
                continue
            wall_box(asset, 'plaster_walls', 'plaster_lime', u, y, -.10,
                     b-a, hi-lo, .24, normal, tangent, distance)
    for o in openings:
        if o['kind'] == 'door':
            door(asset, o, normal, tangent, distance)
        else:
            window(asset, o, normal, tangent, distance)


def door(asset, opening, normal, tangent, distance):
    u, low, w, h = (opening[k] for k in ('u', 'y', 'w', 'h'))
    y = low+h/2
    wb = lambda group, mat, du, dy, off, width, height, dep: wall_box(
        asset, group, mat, u+du, y+dy, off, width, height, dep, normal, tangent, distance)
    wb('doors', 'recess_shadow', 0, 0, -.18, w, h, .05)
    count = 6
    for i in range(count):
        wb('doors', 'door_oak' if i % 3 else 'door_oak_light',
           -w/2+(i+.5)*w/count, 0, -.10, w/count-.012, h-.03, .085)
    for dx in [-w/2-.10, w/2+.10]:
        wb('opening_frames', 'timber_structure', dx, .01, .055, .18, h+.18, .29)
    wb('opening_frames', 'timber_endgrain', 0, h/2+.11, .07, w+.43, .24, .34)
    wb('stone_sills', 'stone_light', 0, -h/2-.045, .1, w+.40, .10, .56)
    for dy in (-.65, .64):
        wb('door_ironwork', 'iron_aged', -.12, dy, -.036, w*.68, .065, .022)
        for dx in (-w*.38, w*.16):
            p = wall_point(u+dx, y+dy, -.01, normal, tangent, distance)
            q = wall_point(u+dx, y+dy, .015, normal, tangent, distance)
            cylinder(asset, 'door_ironwork', 'brass_worn', p, q, .025, 8)
    p = wall_point(u+w*.31, y-.05, -.02, normal, tangent, distance)
    q = wall_point(u+w*.31, y-.05, .065, normal, tangent, distance)
    cylinder(asset, 'door_ironwork', 'brass_worn', p, q, .048, 10)


def window(asset, opening, normal, tangent, distance):
    u, low, w, h = (opening[k] for k in ('u', 'y', 'w', 'h'))
    y = low+h/2
    wb = lambda group, mat, du, dy, off, width, height, dep: wall_box(
        asset, group, mat, u+du, y+dy, off, width, height, dep, normal, tangent, distance)
    wb('window_recesses', 'recess_shadow', 0, 0, -.20, w, h, .035)
    for ix in range(2):
        for iy in range(3):
            wb('window_glazing', 'window_glass' if (ix+iy) % 3 else 'window_glint',
               (ix-.5)*w/2, (iy-1)*h/3, -.155, w/2-.025, h/3-.025, .027)
    for dx in (-w/2, w/2):
        wb('opening_frames', 'timber_structure', dx, 0, .01, .13, h+.18, .32)
    for dy in (-h/2, h/2):
        wb('opening_frames', 'timber_endgrain', 0, dy, .025, w+.2, .12, .36)
    wb('window_mullions', 'timber_worn', 0, 0, -.08, .055, h, .09)
    for dy in (-h/6, h/6):
        wb('window_mullions', 'timber_worn', 0, dy, -.08, w, .042, .09)
    wb('stone_sills', 'stone_light', 0, -h/2-.13, .095, w+.4, .16, .53)
    wb('opening_frames', 'timber_structure', 0, h/2+.16, .06, w+.4, .13, .40)
    # Held-open wooden shutters carry real thickness and side profiles.
    if not opening.get('shutters', True):
        return
    for side in (-1, 1):
        dx = side*(w/2+.31)
        for plank in range(3):
            wb('shutters', 'timber_worn' if plank == 1 else 'door_oak_light',
               dx+(plank-1)*.105, 0, .015, .102, h*.91, .075)
        for dy in (-h*.31, h*.31):
            wb('shutters', 'timber_structure', dx, dy, .066, .35, .055, .045)


def gable(asset, z, width, eave, ridge, thickness):
    points = []
    for dz in (-thickness/2, thickness/2):
        points += [(-width/2, eave, z+dz), (width/2, eave, z+dz), (0, ridge, z+dz)]
    mesh(asset, 'gable_plaster', 'plaster_warm', points,
         [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)])


def roof(asset, half_width, half_depth, eave, ridge, teal=False):
    # Real pitched roof support with a thickness, fascia and visible rafters.
    slope = (ridge-eave)/half_width
    for side in (-1, 1):
        verts = []
        for drop in (0, -.19):
            verts += [(0, ridge+drop, -half_depth), (side*half_width, eave+drop, -half_depth),
                      (side*half_width, eave+drop, half_depth), (0, ridge+drop, half_depth)]
        mesh(asset, 'roof_underlay', 'timber_structure', verts,
             [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
        beam(asset, 'roof_fascia', 'timber_endgrain', (side*half_width, eave-.09, -half_depth-.03),
             (side*half_width, eave-.09, half_depth+.03), .20, .24)
        for z in (-half_depth-.025, half_depth+.025):
            beam(asset, 'roof_fascia', 'timber_endgrain', (0, ridge-.055, z),
                 (side*half_width, eave-.055, z), .19, .22)
        for i in range(13 if not teal else 7):
            z = -half_depth+.15+i*(2*half_depth-.3)/(12 if not teal else 6)
            beam(asset, 'eave_rafters', 'timber_structure', (side*(half_width-.8), eave+slope*.8-.25, z),
                 (side*(half_width+.04), eave-.25, z), .13, .15)
    tile_mats = ['teal_deep', 'teal_tile', 'teal_faded'] if teal else [
        'terracotta_umber', 'terracotta_russet', 'terracotta_warm', 'terracotta_lit', 'terracotta_aged']
    tile_width = .43 if teal else .48
    count_z = math.ceil(2*half_depth/tile_width)
    width = 2*half_depth/count_z
    count_x = math.ceil(half_width/.53)
    step = half_width/count_x
    for side in (-1, 1):
        # Lower courses precede upper courses; upper edge overlap is modeled.
        for row in range(count_x):
            outer = half_width - row*step
            inner = max(.035, outer-step-.11)
            for col in range(count_z):
                zcenter = -half_depth+(col+.5)*width + RNG.uniform(-.011, .011)
                zwidth = width*.99
                lift = RNG.uniform(.014, .033)
                vertices = []
                for bottom in (False, True):
                    for xdistance in (inner, outer+.025):
                        for k in range(7):
                            t = k/6
                            arch = math.sin(math.pi*t)*(.065 if teal else .09)
                            y = ridge-slope*xdistance + lift+arch + (.035 if xdistance == inner else 0)
                            if bottom:
                                y -= .055
                            vertices.append((side*xdistance, y, zcenter+(t-.5)*zwidth))
                faces = []
                for k in range(6):
                    faces += [(k, k+1, k+8, k+7), (k+14, k+21, k+22, k+15),
                              (k, k+14, k+15, k+1), (k+7, k+8, k+22, k+21)]
                faces += [(0, 7, 21, 14), (6, 20, 27, 13)]
                mesh(asset, 'clay_roof_courses', RNG.choices(tile_mats, [1, 4, 2] if teal else [1, 4, 3, 1, 2])[0], vertices, faces)
    # Individual curved ridge caps, overlapping in the long axis.
    cap_count = math.ceil(2*half_depth/.53)
    for i in range(cap_count):
        z0 = -half_depth+i*2*half_depth/cap_count-.055
        z1 = z0+2*half_depth/cap_count+.11
        verts = []
        for z in (z0, z1):
            for radius in (.20, .145):
                for k in range(9):
                    angle = math.pi*k/8
                    verts.append((math.cos(angle)*radius, ridge+math.sin(angle)*radius+.055, z))
        faces = []
        for k in range(8):
            faces += [(k, k+1, k+19, k+18), (k+9, k+27, k+28, k+10),
                      (k, k+9, k+10, k+1), (k+18, k+19, k+28, k+27)]
        faces += [(0, 18, 27, 9), (8, 17, 35, 26)]
        mesh(asset, 'ridge_caps', 'teal_faded' if teal else 'terracotta_ridge', verts, faces)


def foundation(asset, width, depth, height=.44):
    box(asset, 'foundation_core', 'stone_shadow', (0, height/2, 0), (width, height, depth))
    stones = ['stone_aged', 'stone_light', 'stone_moss']
    for normal, tangent, distance, length in [((0, 1), (1, 0), depth/2, width), ((0, -1), (1, 0), depth/2, width),
                                             ((1, 0), (0, 1), width/2, depth), ((-1, 0), (0, 1), width/2, depth)]:
        for row in range(2):
            divisions = math.ceil(length/.68)
            step = length/divisions
            for i in range(divisions):
                u = -length/2+(i+.5)*step
                wall_box(asset, 'foundation_courses', RNG.choices(stones, [6, 2, 1])[0],
                         u, (row+.5)*height/2, RNG.uniform(.002, .025), step-.018,
                         height/2-.02, .11, normal, tangent, distance)


def cottage():
    asset = 'cottage'
    foundation(asset, 7.30, 6.30)
    bottom, top = .44, 3.70
    front = [dict(kind='door', u=0, y=bottom, w=1.20, h=2.22)]
    front += [dict(kind='window', u=x, y=1.33, w=.92, h=1.28) for x in (-2.20, 2.20)]
    back = [dict(kind='door', u=1.95, y=bottom, w=1.10, h=2.16),
            dict(kind='window', u=-1.65, y=1.28, w=1.35, h=1.32)]
    sides = [dict(kind='window', u=z, y=1.33, w=1.06, h=1.30) for z in (-1.65, 1.65)]
    for normal, tangent, distance, length, openings in [
            ((0, 1), (1, 0), 3.1, 7.2, front), ((0, -1), (1, 0), 3.1, 7.2, back),
            ((1, 0), (0, 1), 3.6, 6.2, sides), ((-1, 0), (0, 1), 3.6, 6.2, sides)]:
        wall_with_openings(asset, normal, tangent, distance, length, bottom, top, openings)
        for u in [-length/2, 0, length/2]:
            # The center post is omitted where the front door occupies its line.
            if normal == (0, 1) and u == 0:
                continue
            wall_box(asset, 'structural_frame', 'timber_structure', u, (bottom+top)/2, .075,
                     .22, top-bottom+.04, .28, normal, tangent, distance)
        for y in (.56, 3.05, 3.61):
            wall_box(asset, 'structural_frame', 'timber_structure', 0, y, .075,
                     length+.24, .18 if y != 3.61 else .24, .28, normal, tangent, distance)
        # Short knee braces and pegs express actual timber joints.
        for u, direction in [(-length/2+.08, 1), (length/2-.08, -1)]:
            p = wall_point(u, 2.84, .11, normal, tangent, distance)
            q = wall_point(u+direction*.65, 3.47, .11, normal, tangent, distance)
            beam(asset, 'structural_braces', 'timber_endgrain', p, q, .125, .16)
        for u in [-length/2, length/2]:
            p = wall_point(u, 3.40, .23, normal, tangent, distance)
            q = wall_point(u, 3.40, .255, normal, tangent, distance)
            cylinder(asset, 'joinery_pegs', 'timber_worn', p, q, .035, 8)
    for z in (-3.1, 3.1):
        gable(asset, z, 7.2, 3.7, 5.96, .23)
        beam(asset, 'gable_frame', 'timber_structure', (-3.6, 3.72, z*1.025), (0, 5.98, z*1.025), .19, .22)
        beam(asset, 'gable_frame', 'timber_structure', (3.6, 3.72, z*1.025), (0, 5.98, z*1.025), .19, .22)
        beam(asset, 'gable_frame', 'timber_structure', (0, 3.72, z*1.025), (0, 5.95, z*1.025), .20, .22)
        for x in (-1.15, 1.15):
            beam(asset, 'gable_frame', 'timber_endgrain', (x, 3.72, z*1.025), (x*.5, 4.95, z*1.025), .12, .15)
        # Small dimensional attic ventilation louvres, coherent on both gables.
        for x in (-.55, .55):
            normal, tangent = (0, 1 if z > 0 else -1), (1, 0)
            wall_box(asset, 'attic_vents', 'recess_shadow', x, 4.55, .08, .46, .66, .12, normal, tangent, 3.1)
            for j in range(5):
                wall_box(asset, 'attic_vents', 'timber_endgrain', x, 4.30+j*.125, .15, .49, .053, .15, normal, tangent, 3.1)
    roof(asset, 4.05, 3.67, 3.70, 6.20)
    # Three-sided stone steps, with each rise small enough for M1 autostep.
    box(asset, 'porch_steps', 'stone_aged', (0, .09, 3.92), (1.9, .18, 1.16))
    box(asset, 'porch_steps', 'stone_light', (0, .26, 3.64), (1.64, .16, .65))
    box(asset, 'porch_steps', 'stone_aged', (1.95, .09, -3.7), (1.60, .18, .94))
    box(asset, 'porch_steps', 'stone_light', (1.95, .26, -3.43), (1.42, .16, .50))
    # Modest porch brow supported by small brackets, not a second giant roof mass.
    for x in (-.94, .94):
        beam(asset, 'porch_brackets', 'timber_structure', (x, 2.82, 3.28), (x, 3.05, 3.78), .11)
    box(asset, 'porch_brow', 'timber_endgrain', (0, 3.12, 3.48), (2.25, .14, .90))
    # Chimney rises through the roof with weathered courses and an open dark flue.
    chimney_x, chimney_z = -1.56, -.90
    box(asset, 'chimney_mortar', 'stone_shadow', (chimney_x, 5.95, chimney_z), (.69, 1.54, .77))
    for row in range(8):
        for side in (-1, 1):
            for half in (-1, 1):
                box(asset, 'chimney_stones', ['stone_aged', 'stone_light'][(row+(side+half)//2) % 2],
                    (chimney_x+half*.18, 5.23+row*.19, chimney_z+side*.385), (.34, .172, .065))
                box(asset, 'chimney_stones', 'stone_aged',
                    (chimney_x+side*.345, 5.23+row*.19, chimney_z+half*.19), (.06, .172, .37))
    box(asset, 'chimney_cap', 'stone_light', (chimney_x, 6.77, chimney_z), (.89, .18, .98))
    box(asset, 'chimney_flue', 'recess_shadow', (chimney_x, 6.865, chimney_z), (.51, .018, .58))
    for dx, dz, sx, sz in [(-.34, 0, .15, .8), (.34, 0, .15, .8), (0, -.33, .55, .15), (0, .33, .55, .15)]:
        box(asset, 'chimney_flue', 'stone_aged', (chimney_x+dx, 6.94, chimney_z+dz), (sx, .18, sz))
    # Restrained cellar-side utility barrels stay tight against the wall.
    barrel(asset, (-3.99, 0, -1.40), .40, .88)
    barrel(asset, (-4.03, 0, -.47), .33, .71)


def barrel(asset, center, radius, height):
    cx, cy, cz = center
    sides, levels = 14, [(0, .86), (.10, .95), (.50, 1), (.90, .95), (1, .86)]
    for side in range(sides):
        a0, a1 = 2*math.pi*(side+.015)/sides, 2*math.pi*(side+.985)/sides
        verts = []
        for y, r in levels:
            for angle in (a0, a1):
                verts.append((cx+radius*r*math.cos(angle), cy+y*height, cz+radius*r*math.sin(angle)))
        faces = [(j*2, j*2+1, j*2+3, j*2+2) for j in range(4)]
        mesh(asset, 'barrel_staves', 'door_oak' if side % 3 else 'door_oak_light', verts, faces)
    cylinder(asset, 'barrel_lids', 'timber_endgrain', (cx, cy+height-.035, cz), (cx, cy+height, cz), radius*.85, sides)
    for y in (.15, .78):
        for side in range(sides):
            a0, a1 = 2*math.pi*side/sides, 2*math.pi*(side+1)/sides
            r = radius*.98
            p = (cx+r*math.cos(a0), cy+y*height, cz+r*math.sin(a0))
            q = (cx+r*math.cos(a1), cy+y*height, cz+r*math.sin(a1))
            beam(asset, 'barrel_hoops', 'hoop_iron', p, q, .046, .020)


def shed():
    asset = 'shed'
    foundation(asset, 3.08, 2.88, .26)
    wall_with_openings(asset, (0, 1), (1, 0), 1.4, 3, .26, 2.44,
                       [dict(kind='door', u=-.20, y=.26, w=1.03, h=1.98)])
    wall_with_openings(asset, (0, -1), (1, 0), 1.4, 3, .26, 2.44,
                       [dict(kind='window', u=0, y=1.13, w=.70, h=.73, shutters=False)])
    for side in (-1, 1):
        wall_with_openings(asset, (side, 0), (0, 1), 1.5, 2.8, .26, 2.44,
                           [dict(kind='window', u=.18, y=1.10, w=.78, h=.81, shutters=False)])
    for x in (-1.5, 1.5):
        for z in (-1.4, 1.4):
            box(asset, 'shed_frame', 'timber_structure', (x, 1.39, z), (.19, 2.3, .19))
    for z in (-1.4, 1.4):
        for y in (.35, 2.39):
            box(asset, 'shed_frame', 'timber_endgrain', (0, y, z), (3.13, .16, .19))
        gable(asset, z, 3, 2.44, 3.28, .18)
    for x in (-1.5, 1.5):
        for y in (.35, 2.39):
            box(asset, 'shed_frame', 'timber_endgrain', (x, y, 0), (.19, .16, 2.9))
    roof(asset, 1.81, 1.69, 2.40, 3.44, True)
    box(asset, 'shed_step', 'stone_aged', (-.2, .08, 1.73), (1.30, .16, .70))
    # A garden-tool shelf makes the small outbuilding legible from its rear.
    box(asset, 'shed_shelf', 'timber_worn', (0, .81, -1.72), (1.77, .095, .52))
    for x in (-.69, .69):
        beam(asset, 'shed_shelf', 'timber_structure', (x, .42, -1.46), (x, .78, -1.89), .07)


def bridge():
    asset = 'bridge'
    # The accessible center remains completely clear; deck top is exactly y=0.
    plank_count = 37
    spacing = 14/plank_count
    for i in range(plank_count):
        z = -7+(i+.5)*spacing
        color = ['bridge_oak', 'bridge_oak_light', 'bridge_oak_dark'][RNG.choices([0, 1, 2], [6, 2, 1])[0]]
        width = 3.6+RNG.uniform(-.055, .055)
        box(asset, 'deck_planks', color, (RNG.uniform(-.017, .017), -.09, z),
            (width, .18, spacing-.019), RNG.uniform(-.003, .003))
        # Two pegs per side and a few narrow grain scores are human-scale accents.
        for x in (-1.27, 1.27):
            cylinder(asset, 'deck_pegs', 'iron_aged', (x, -.009, z), (x, .004, z), .024, 8)
    for x in (-1.30, 1.30):
        box(asset, 'longitudinal_girders', 'timber_structure', (x, -.36, 0), (.31, .38, 14.24))
    # Handrails at 1.02m, low rail at .43m. Square structural posts have oak caps.
    post_positions = [-6.72, -4.48, -2.24, 0, 2.24, 4.48, 6.72]
    for side in (-1, 1):
        x = side*1.65
        for z in post_positions:
            box(asset, 'rail_posts', 'bridge_oak_dark', (x, .39, z), (.19, 1.32, .21))
            box(asset, 'rail_caps', 'bridge_oak_light', (x, 1.073, z), (.25, .11, .27))
            cylinder(asset, 'rail_pegs', 'iron_aged', (x-side*.115, .83, z), (x-side*.13, .83, z), .031, 8)
        for a, b in zip(post_positions, post_positions[1:]):
            beam(asset, 'handrails', 'bridge_oak_light', (x, .99, a-.1), (x, .99, b+.1), .12, .15)
            beam(asset, 'lower_rails', 'bridge_oak', (x, .43, a), (x, .43, b), .095, .12)
            beam(asset, 'rail_bracing', 'bridge_oak_dark', (x, .47, a+.14), (x, .88, b-.14), .065, .075)
    # Four trestles with true underside connections; placed below walking deck.
    for z in (-5.55, -1.86, 1.86, 5.55):
        box(asset, 'transverse_beams', 'bridge_oak_dark', (0, -.58, z), (3.85, .26, .29))
        for side in (-1, 1):
            beam(asset, 'trestle_piles', 'timber_structure', (side*1.38, -2.15, z), (side*1.20, -.52, z), .25, .28)
            beam(asset, 'trestle_braces', 'bridge_oak', (side*1.34, -1.86, z+.16), (-side*.84, -.62, z+.16), .14, .15)
    for z in (-7.02, 7.02):
        box(asset, 'end_plates', 'bridge_oak_dark', (0, -.16, z), (3.80, .30, .15))


def to_blender(v):
    return (v[0], -v[2], v[1])


def make_objects():
    collections = {}
    for asset in ('cottage', 'shed', 'bridge'):
        collection = bpy.data.collections.new('rural_' + asset)
        bpy.context.scene.collection.children.link(collection)
        collections[asset] = collection
    for (asset, group, mat), part in PARTS.items():
        name = f'{asset}_{group}_{mat}'
        data = bpy.data.meshes.new(name)
        data.from_pydata([to_blender(v) for v in part['vertices']], [], part['faces'])
        data.update()
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(name, data)
        collections[asset].objects.link(obj)
        obj.data.materials.append(MATERIALS[mat])
        obj['asset_id'] = f'rural.{asset}'
        obj['part'] = group
        obj['units'] = 'meters'
        # Soften structural carpentry/stone edges, retaining the sculpted roof mesh.
        # Wall partitions meet at exactly shared planes around real opening voids.
        # Beveling each partition would invent grout-like seams across the plaster.
        if group not in ('plaster_walls', 'gable_plaster', 'clay_roof_courses', 'ridge_caps',
                         'barrel_staves', 'barrel_hoops', 'window_glazing'):
            bevel = obj.modifiers.new('small_worn_edges', 'BEVEL')
            bevel.width = .012 if asset != 'shed' else .009
            bevel.segments = 1
            bevel.affect = 'EDGES'
            bevel.limit_method = 'ANGLE'
            bevel.angle_limit = .65
            bevel.harden_normals = True
    return collections


def asset_report(asset, objects):
    minimum, maximum = [float('inf')]*3, [-float('inf')]*3
    triangles, vertices = 0, 0
    mats, groups = set(), set()
    part_bounds = {}
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(deps)
        data = evaluated.to_mesh()
        data.calc_loop_triangles()
        triangles += len(data.loop_triangles)
        vertices += len(data.vertices)
        part_bounds.setdefault(obj['part'], {'min': [float('inf')]*3, 'max': [-float('inf')]*3})
        part = part_bounds[obj['part']]
        for vertex in data.vertices:
            p = obj.matrix_world @ vertex.co
            runtime = [p.x, p.z, -p.y]
            for i in range(3):
                minimum[i] = min(minimum[i], runtime[i])
                maximum[i] = max(maximum[i], runtime[i])
                part['min'][i] = min(part['min'][i], runtime[i])
                part['max'][i] = max(part['max'][i], runtime[i])
        mats.update(slot.material.name for slot in obj.material_slots if slot.material)
        groups.add(obj['part'])
        evaluated.to_mesh_clear()
    return {'id': f'rural.{asset}', 'units': 'meters', 'seed': SEED,
            'bounds': {'min': [round(v, 5) for v in minimum], 'max': [round(v, 5) for v in maximum]},
            'triangles': triangles, 'vertices': vertices, 'materials': sorted(mats),
            'materialCount': len(mats), 'meshObjects': len(objects), 'textures': 0,
            'groups': sorted(groups), 'partBounds': {
                name: {key: [round(v, 5) for v in values] for key, values in bounds.items()}
                for name, bounds in part_bounds.items()},
            'origin': 'ground center' if asset != 'bridge' else 'deck top center',
            'axisConvention': 'Blender X -> glTF X, Blender Y -> glTF -Z, Blender Z -> glTF Y; front glTF +Z',
            'collision': 'Separate runtime authored simplified proxies; visual asset is not used as a triangle-mesh collider',
            'lod': 'Single M2 hero asset; no unmeasured distance LOD',
            'preview': 'Parent captures and inspects all sides in actual Three.js runtime; export is not art approval'}


def joined_export_objects(asset, objects, part_bounds):
    """Join evaluated meshes by material; keep editable named parts in the .blend.

    Part names and exact original bounds are preserved as glTF extras. This avoids
    dozens of draws for the same oak or stone, without deleting inspection data.
    """
    deps = bpy.context.evaluated_depsgraph_get()
    by_material = defaultdict(list)
    for original in objects:
        evaluated = original.evaluated_get(deps)
        data = bpy.data.meshes.new_from_object(evaluated, depsgraph=deps)
        obj = bpy.data.objects.new('export_' + original.name, data)
        bpy.context.scene.collection.objects.link(obj)
        material_name = original.material_slots[0].material.name
        by_material[material_name].append((obj, original['part']))
    joined = []
    for material_name, parts in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj, _ in parts:
            obj.select_set(True)
        obj = parts[0][0]
        bpy.context.view_layer.objects.active = obj
        if len(parts) > 1:
            bpy.ops.object.join()
        obj.name = f'{asset}_material_{material_name}'
        obj['asset_id'] = f'rural.{asset}'
        obj['units'] = 'meters'
        names = sorted(set(part for _, part in parts))
        obj['parts'] = names
        obj['part_bounds_m'] = json.dumps({name: part_bounds[name] for name in names}, separators=(',', ':'))
        joined.append(obj)
    return joined


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    palette()
    cottage()
    shed()
    bridge()
    collections = make_objects()
    report = {'schemaVersion': 1, 'blenderVersion': bpy.app.version_string, 'seed': SEED,
              'provenance': 'Original project-authored procedural sculpture, exported in isolated local Blender. No external assets, image textures, services or downloads.',
              'license': 'Project license unassigned; no third-party source content',
              'source': 'assets/source/rural-hero.blend', 'generator': 'tools/blender/rural_hero.py',
              'assumptions': ['Single supplied rural view cannot establish exact dimensions or unseen sides.',
                              'Rear/side openings, roof construction, chimney flue, bridge trestles and shed shelf are coherent authored interpretations.',
                              'Doors are modeled closed; no full house interior or interaction is included in M2.'],
              'assets': []}
    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(os.path.dirname(args.source), exist_ok=True)
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    for asset, collection in collections.items():
        objects = list(collection.objects)
        entry = asset_report(asset, objects)
        export_objects = joined_export_objects(asset, objects, entry['partBounds'])
        bpy.ops.object.select_all(action='DESELECT')
        for obj in export_objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = export_objects[0]
        output = os.path.join(args.output_dir, asset+'.glb')
        result = bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True,
                                         export_yup=True, export_extras=True, export_animations=False,
                                         export_apply=True, export_materials='EXPORT')
        if 'FINISHED' not in result or not os.path.isfile(output):
            raise RuntimeError(f'Failed export: {asset}')
        with open(output, 'rb') as file:
            blob = file.read()
        entry['sha256'] = hashlib.sha256(blob).hexdigest()
        entry['bytes'] = len(blob)
        entry['path'] = 'public/assets/rural/'+asset+'.glb'
        report['assets'].append(entry)
        for obj in export_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    for data in list(bpy.data.meshes):
        if data.users == 0:
            bpy.data.meshes.remove(data)
    # Dedicated source holds the three independent collections at true asset origins.
    # Open one collection at a time to inspect; overlapping origins preserve pivots.
    bpy.ops.object.select_all(action='DESELECT')
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_end = 1000
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.source))
    with open(args.report, 'w', encoding='utf-8') as file:
        json.dump(report, file, indent=2)
        file.write('\n')
    print('VOXARRIUM_RURAL: cottage, shed and bridge GLBs exported. Runtime all-side inspection still required.')


if __name__ == '__main__':
    main()
