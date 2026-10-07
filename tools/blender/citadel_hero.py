"""M9 citadel: deliberate meter-scale architecture in an isolated Blender session.

Coordinates below are runtime world meters. Export subtracts the immutable
(150,50,-605) placement then converts (x,y,z) to Blender (x,-z,y), once.
Semantic source objects remain editable; runtime export is merged by material.
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
from mathutils import Vector

ANCHOR=(150,50,-605)
PARTS=defaultdict(lambda:{'vertices':[],'faces':[]})
MATERIALS={}
PALETTE={
 'stone_citadel':0xB9AE90,'stone_citadel_light':0xCEC3A4,'stone_citadel_shadow':0x918E78,
 'plaster_citadel':0xD8CCA9,'plaster_citadel_warm':0xCEBE98,
 'terracotta_citadel':0xA65A37,'terracotta_citadel_light':0xBE7448,'terracotta_citadel_aged':0x8E4C31,
 'teal_citadel':0x397B73,'teal_citadel_light':0x528C7D,
 'timber_citadel':0x624C33,'door_oak_citadel':0x866C45,
 'window_citadel':0x344F49,'window_warm':0x9C8B56,'iron_citadel':0x475044,
 'brass_citadel':0xAB894C,'recess_citadel':0x333A31,
}
SKYLINE_PALETTE={'skyline_stone':0xB9AE90,'skyline_lime':0xD8CCA9,'skyline_clay':0xA65A37,
 'skyline_teal':0x397B73,'skyline_timber':0x624C33,'skyline_shadow':0x918E78}
# World-space closed collision/render contract, also retained verbatim in report.
RETURN_APRON={'id':'citadel.return-apron','color':0xB7AC91,'vertices':[
 158.070765,50,-595.111314,150.827206,50,-600.90616,
 158.398267,47.238926,-589.00878,160.929251,47.238926,-590.619406,
 158.070765,48.055636458476826,-595.111314,150.827206,49.40208609401795,-600.90616],
 'indices':[0,1,2,0,2,3,4,3,2,4,2,5,0,4,5,0,5,1,0,3,4,1,5,2]}

def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4

def palette():
 for name,color in PALETTE.items():
  m=bpy.data.materials.new(name);m.use_nodes=True
  rgb=tuple(linear(((color>>s)&255)/255) for s in (16,8,0))
  m.diffuse_color=(*rgb,1);node=m.node_tree.nodes.get('Principled BSDF')
  node.inputs['Base Color'].default_value=(*rgb,1)
  node.inputs['Roughness'].default_value=.5 if name.startswith('window') else .88
  node.inputs['Metallic'].default_value=.22 if name.startswith(('iron','brass')) else 0
  MATERIALS[name]=m

def mesh(part,mat,vertices,faces):
 p=PARTS[(part,mat)];off=len(p['vertices']);p['vertices'].extend(vertices)
 p['faces'].extend(tuple(i+off for i in f) for f in faces)

def box(part,mat,center,size,yaw=0):
 x,y,z=center;a,b,c=(v/2 for v in size);co,si=math.cos(yaw),math.sin(yaw)
 vs=[(x+u*co+w*si,y+v,z-u*si+w*co) for u,v,w in
  [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]]
 mesh(part,mat,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

def beam(part,mat,a,b,width,depth=None):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();ref=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((0,1,0))
 u=axis.cross(ref).normalized()*width/2;v=axis.cross(u).normalized()*(depth or width)/2
 vs=[tuple(p+su*u+sv*v) for p in (a,b) for su,sv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh(part,mat,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

def cylinder(part,mat,x,z,low,high,r,sides=12,r2=None,phase=math.pi/12):
 vs=[(x+rr*math.cos(phase+i*math.tau/sides),y,z+rr*math.sin(phase+i*math.tau/sides))
  for y,rr in [(low,r),(high,r if r2 is None else r2)] for i in range(sides)]
 mesh(part,mat,vs,[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)])

def facade_point(x,z,normal,u,y,offset=0):
 nx,nz=normal;return (x+nz*u+nx*offset,y,z-nx*u+nz*offset)

def facade_box(part,mat,x,z,normal,u,y,off,w,h,d):
 # Tangent/normal basis also supports the eight deliberate belfry elevations.
 nx,nz=normal;box(part,mat,facade_point(x,z,normal,u,y,off),(w,h,d),math.atan2(nx,nz))

def arch(part,x,z,y,width,height,depth,normal=(0,1),mat='stone_citadel_light',thickness=.32,segments=12):
 # Semicircular voussoirs create an actual void and visible soffit.
 radius=width/2;spring=y+height-radius;n=segments
 nx,nz=normal
 for i in range(n):
  a=i*math.pi/n+.004;b=(i+1)*math.pi/n-.004
  vs=[]
  for off in [-depth/2,depth/2]:
   for theta,r in [(a,radius),(b,radius),(b,radius+thickness),(a,radius+thickness)]:
    vs.append(facade_point(x,z,normal,math.cos(theta)*r,spring+math.sin(theta)*r,off))
  mesh(part,mat,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 for u in [-radius-thickness/2,radius+thickness/2]:
  facade_box(part,mat,x,z,normal,u,(y+spring)/2,0,thickness,spring-y,depth)

def window(part,x,z,normal,u,base,w=1.25,h=2.35,warm=False):
 # Windows are dimensional stone reveals, shadow recesses and inset glazing.
 facade_box(part+'.recess','recess_citadel',x,z,normal,u,base+h/2,-.07,w+.12,h+.12,.12)
 facade_box(part+'.glass','window_warm' if warm else 'window_citadel',x,z,normal,u,base+h*.47,-.035,w-.18,h-.27,.06)
 for du in [-w/2-.11,w/2+.11]:
  facade_box(part+'.jamb','stone_citadel_light',x,z,normal,u+du,base+h/2,.085,.20,h+.18,.26)
 facade_box(part+'.lintel','stone_citadel_light',x,z,normal,u,base+h+.10,.10,w+.55,.22,.31)
 facade_box(part+'.sill','stone_citadel_light',x,z,normal,u,base-.08,.20,w+.48,.20,.48)
 facade_box(part+'.mullion','stone_citadel_shadow',x,z,normal,u,base+h*.48,.025,.09,h-.12,.11)
 facade_box(part+'.transom','stone_citadel_shadow',x,z,normal,u,base+h*.57,.025,w-.05,.09,.11)
 if h>3:
  arch(part+'.arch',*facade_point(x,z,normal,u,0,.15)[::2],base,w,h,.22,normal,thickness=.21)

def door(part,x,z,normal,w=2.4,h=4.2):
 facade_box(part+'.shadow','recess_citadel',x,z,normal,0,50+h/2,.02,w+.18,h+.08,.12)
 for i in range(10):
  facade_box(part+'.leaf','door_oak_citadel',x,z,normal,-w/2+(i+.5)*w/10,50+h/2,.08,w/10-.014,h-.05,.12)
 arch(part+'.arch',x,z,50,w,h,.54,normal,thickness=.42)
 for y in [51,52.5,53.3]:facade_box(part+'.iron','iron_citadel',x,z,normal,0,y,.16,w-.12,.13,.05)
 facade_box(part+'.lock','brass_citadel',x,z,normal,.18,51.9,.18,.17,.29,.08)

def shell(part,x,z,w,d,base,height,mat='plaster_citadel',floors=None):
 top=base+height
 # Full elevations split around window voids. Internal solids are deliberately closed collision.
 for normal,length,wx,wz in [((0,1),w,x,z+d/2),((0,-1),w,x,z-d/2),((1,0),d,x+w/2,z),((-1,0),d,x-w/2,z)]:
  n=max(2,int(length/5.6));us=[-length/2+(i+.5)*length/n for i in range(n)]
  levels=floors or [base+4.2+i*5.8 for i in range(max(1,int((height-5)/5.8)))]
  openings=[(u,y,1.45,2.8) for y in levels if y+3<top for u in us]
  xcuts=sorted(set([-length/2,length/2]+[v for u,y,ww,hh in openings for v in [u-ww/2,u+ww/2]]))
  ycuts=sorted(set([base,top]+[v for u,y,ww,hh in openings for v in [y,y+hh]]))
  for a,b in zip(xcuts,xcuts[1:]):
   for lo,hi in zip(ycuts,ycuts[1:]):
    u,y=(a+b)/2,(lo+hi)/2
    if any(abs(u-ou)<ww/2-.001 and oy<y<oy+hh for ou,oy,ww,hh in openings):continue
    facade_box(part+'.walls',mat,wx,wz,normal,u,y,-.28,b-a,hi-lo,.56)
  for i,(u,y,ww,hh) in enumerate(openings):window(part+'.windows',wx,wz,normal,u,y,ww,hh,(i+int(wx))%7==0)
 # Continuous floors close the roof and plinth from overhead and beneath.
 box(part+'.plinth','stone_citadel_shadow',(x,base+.42,z),(w+.45,.84,d+.45))
 box(part+'.top','stone_citadel',(x,top-.14,z),(w,.28,d))
 for y in [base+1.1,top-.8,top+.04]:
  for normal,length,wx,wz in [((0,1),w,x,z+d/2),((0,-1),w,x,z-d/2),((1,0),d,x+w/2,z),((-1,0),d,x-w/2,z)]:
   facade_box(part+'.cornice','stone_citadel_light',wx,wz,normal,0,y,.16,length+.58,.31,.51)
 # Large paired corner buttresses retain readable wall fields.
 for dx in [-1,1]:
  for dz in [-1,1]:
   for y,h,step in [(base,height*.56,.6),(base+height*.56,height*.28,.40),(base+height*.84,height*.16,.23)]:
    box(part+'.buttress','stone_citadel',(x+dx*(w/2-.30),y+h/2,z+dz*(d/2-.30)),(1.35+step,h,1.35+step))

def hip(part,x,z,w,d,y,h,mat='terracotta_citadel',ridge_axis='x'):
 # Thick hip roof, lower skin, eaves and dimensional ribs. No single facade plane.
 w+=1.9;d+=1.9
 ridge=max(1,(w-d)*.42) if ridge_axis=='x' else max(1,(d-w)*.42)
 if ridge_axis=='x':p=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x+w/2,y,z+d/2),(x-w/2,y,z+d/2),(x-ridge/2,y+h,z),(x+ridge/2,y+h,z)]
 else:p=[(x-w/2,y,z-d/2),(x+w/2,y,z-d/2),(x+w/2,y,z+d/2),(x-w/2,y,z+d/2),(x,y+h,z-ridge/2),(x,y+h,z+ridge/2)]
 faces=[(0,4,5,1),(1,5,2),(2,5,4,3),(3,4,0)] if ridge_axis=='x' else [(0,4,1),(1,4,5,2),(2,5,3),(3,5,4,0)]
 mesh(part+'.roof',mat,p,faces)
 mesh(part+'.underside','timber_citadel',[(a,b-.32,c) for a,b,c in p],[(0,1,2,3)])
 for a,b in [(0,1),(1,2),(2,3),(3,0)]:beam(part+'.eaves','timber_citadel',p[a],p[b],.28,.42)
 for a,b in ([(0,4),(3,4),(1,5),(2,5),(4,5)] if ridge_axis=='x' else [(0,4),(1,4),(2,5),(3,5),(4,5)]):
  beam(part+'.hip-cap','terracotta_citadel_light',p[a],p[b],.25,.27)
 # Selective horizontal roof seams and long ribs communicate terracotta scales.
 rows=max(6,int(h/.42))
 for row in range(1,rows):
  t=row/rows
  if ridge_axis=='x':
   x0=x-w/2*(1-t)-ridge/2*t;x1=x+w/2*(1-t)+ridge/2*t
   for side in [-1,1]:beam(part+'.tile-course','terracotta_citadel_aged',(x0,y+h*t+.045,z+side*d/2*(1-t)),(x1,y+h*t+.045,z+side*d/2*(1-t)),.06,.06)
  else:
   z0=z-d/2*(1-t)-ridge/2*t;z1=z+d/2*(1-t)+ridge/2*t
   for side in [-1,1]:beam(part+'.tile-course','terracotta_citadel_aged',(x+side*w/2*(1-t),y+h*t+.045,z0),(x+side*w/2*(1-t),y+h*t+.045,z1),.06,.06)
 for i in range(1,max(4,int(w/2.2))):
  xx=x-w/2+i*w/max(4,int(w/2.2))
  if ridge_axis=='x' and abs(xx-x)<ridge/2:
   for side in [-1,1]:beam(part+'.roof-rib',mat,(xx,y+.09,z+side*d/2),(xx,y+h+.05,z),.065,.065)

def dome(part,x,z,y,r,h,teal=True,sides=16):
 mat='teal_citadel' if teal else 'terracotta_citadel';bright='teal_citadel_light' if teal else 'terracotta_citadel_light'
 profile=[(y,r),(y+.28,r*1.04),(y+h*.23,r*.89),(y+h*.49,r*.71),(y+h*.73,r*.44),(y+h*.88,r*.20),(y+h,r*.055)]
 for (lo,a),(hi,b) in zip(profile,profile[1:]):cylinder(part+'.cap',mat,x,z,lo,hi,a,sides,b,phase=0 if sides==8 else math.pi/12)
 for i in range(0,sides,2):
  angle=(i+.5)*math.tau/sides
  for (lo,a),(hi,b) in zip(profile,profile[1:]):beam(part+'.cap-rib',bright,(x+math.cos(angle)*a,lo+.03,z+math.sin(angle)*a),(x+math.cos(angle)*b,hi+.03,z+math.sin(angle)*b),.10,.10)
 cylinder(part+'.finial','brass_citadel',x,z,y+h,y+h+.45,.17,8,.05)

def belfry_openings(part,x,z,base,top,r,width,height,segments=12,mat='stone_citadel_light'):
 """Eight full-depth arch openings, with closed piers and curved spandrels.

 There is no filled drum behind a painted recess. The top and bottom rings
 carry the roof; each side remains open between genuine structural piers.
 """
 apothem=r*math.cos(math.pi/8);length=2*r*math.sin(math.pi/8)
 radius=width/2;spring=base+height-radius;depth=.64
 for i in range(8):
  angle=(i+1)*math.pi/4;normal=(math.cos(angle),math.sin(angle))
  wx,wz=x+normal[0]*apothem,z+normal[1]*apothem
  pier=(length-width)/2
  for side in [-1,1]:facade_box(part+'.belfry.pier',mat,wx,wz,normal,side*(width/2+pier/2),(base+top)/2,0,pier,top-base,depth)
  for n in range(segments):
   a=n*math.pi/segments;b=(n+1)*math.pi/segments
   ua,ub=math.cos(a)*radius,math.cos(b)*radius
   ya,yb=spring+math.sin(a)*radius,spring+math.sin(b)*radius
   vs=[facade_point(wx,wz,normal,u,y,off) for off in [-depth/2,depth/2]
    for u,y in [(ua,ya),(ub,yb),(ub,top),(ua,top)]]
   mesh(part+'.belfry.spandrel',mat,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])

def belfry(part,x,z,body_top,top,r,width,height):
 # Horizontal rings are substantial silhouette identifiers, visible on every
 # elevation. Their extents stay inside the former proxy presentation roof.
 cylinder(part+'.drum','stone_citadel',x,z,body_top-.75,body_top+.18,r,8,phase=math.pi/8)
 cylinder(part+'.belfry.gallery','stone_citadel_light',x,z,body_top+.18,body_top+.48,r+.40,8,phase=math.pi/8)
 belfry_openings(part,x,z,body_top+.48,top,r,width,height)
 cylinder(part+'.belfry.band','stone_citadel_shadow',x,z,top-.28,top-.06,r+.30,8,phase=math.pi/8)
 cylinder(part+'.belfry.cornice','stone_citadel_light',x,z,top-.06,top+.12,r+.45,8,phase=math.pi/8)
 # One physical bell is readable through the gallery, rather than a facade decal.
 cylinder(part+'.belfry.bell','iron_citadel',x,z,body_top+1.0,body_top+2.15,1.1,8,.65,phase=0)
 cylinder(part+'.belfry.bell','iron_citadel',x,z,body_top+2.15,top-.22,.16,8,phase=0)

def clock_faces(part,x,z,w,d,y):
 # Four large inset dial discs distinguish the court bell from crown towers.
 # Dimensional centers/hands are close detail; the dark dial survives skyline LOD.
 for normal,wx,wz in [((0,1),x,z+d/2),((0,-1),x,z-d/2),((1,0),x+w/2,z),((-1,0),x-w/2,z)]:
  vs=[facade_point(wx,wz,normal,math.cos(i*math.tau/8)*1.35,y+math.sin(i*math.tau/8)*1.35,off)
   for off in [.30,.42] for i in range(8)]
  mesh(part+'.clock.dial','recess_citadel',vs,[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)])
  facade_box(part+'.clock.hand','brass_citadel',wx,wz,normal,0,y+.36,.44,.10,.85,.08)
  facade_box(part+'.clock.hand','brass_citadel',wx,wz,normal,.27,y,.44,.62,.10,.08)

def tower(part,x,z,w,d,height,roof='hip',teal=False):
 base=50;top=base+height
 shell(part,x,z,w,d,base,height,'stone_citadel_light' if part=='watch-tower' else 'plaster_citadel')
 # Balcony ring is carried by corbels on all elevations.
 for normal,length,wx,wz in [((0,1),w,x,z+d/2),((0,-1),w,x,z-d/2),((1,0),d,x+w/2,z),((-1,0),d,x-w/2,z)]:
  facade_box(part+'.gallery','stone_citadel',wx,wz,normal,0,top-5.2,.4,length+1.4,.6,1.1)
  for u in [-length*.36,-length*.12,length*.12,length*.36]:
   facade_box(part+'.corbels','stone_citadel_shadow',wx,wz,normal,u,top-5.85,.3,.45,.9,.72)
  for i in range(max(4,int(length/1.7))):
   u=-length/2+(i+.5)*length/max(4,int(length/1.7))
   facade_box(part+'.gallery-rail','stone_citadel_light',wx,wz,normal,u,top-4.65,.87,.18,.68,.18)
  facade_box(part+'.gallery-rail','stone_citadel_light',wx,wz,normal,0,top-4.26,.87,length+.72,.2,.24)
 if roof=='dome':
  if part in ('watch-tower','east-beacon'):
   crown_base=96.25 if part=='watch-tower' else 87.1
   belfry(part,x,z,top,crown_base,max(w,d)*.435,3.4 if part=='watch-tower' else 2.2,3.27 if part=='watch-tower' else 2.0)
   dome(part,x,z,crown_base,max(w,d)*.49,9.7 if part=='watch-tower' else 8.8,teal,sides=8)
  else:
   cylinder(part+'.drum','stone_citadel',x,z,top-.75,top+.35,max(w,d)*.47,8)
   dome(part,x,z,top+.35,max(w,d)*.56,6.7,teal)
 else:
  roof_height={'west-beacon':10.0,'court-bell':9.05,'west-front-tower':7.9}.get(part,5.8)
  hip(part,x,z,w,d,top+.10,roof_height,'teal_citadel' if teal else 'terracotta_citadel',ridge_axis='z' if d>w else 'x')
  finial_height={'west-beacon':1.45,'court-bell':.9,'west-front-tower':.4}.get(part,0)
  if finial_height:cylinder(part+'.finial','brass_citadel',x,z,top+.1+roof_height,top+.1+roof_height+finial_height,.16,8,.045)
 if part=='court-bell':clock_faces(part,x,z,w,d,top-3.0)

def wall(part,x,z,w,d,h):
 base=50;top=base+h
 box(part+'.body','stone_citadel_shadow',(x,base+h/2,z),(w,h,d))
 box(part+'.coping','stone_citadel',(x,top-.15,z),(w+.4,.35,d+.4))
 axis='x' if w>d else 'z';length=max(w,d);n=max(3,int(length/3))
 for i in range(n):
  u=-length/2+(i+.5)*length/n
  box(part+'.merlon','stone_citadel_light',(x+u if axis=='x' else x,top+.48,z+u if axis=='z' else z),(length/n*.46,1.2,d+.2) if axis=='x' else (w+.2,1.2,length/n*.46))
 # Few strong buttresses, rather than covering every masonry face with a grid.
 for i in range(max(2,int(length/12))):
  u=-length/2+(i+.5)*length/max(2,int(length/12))
  box(part+'.buttress','stone_citadel',(x+u if axis=='x' else x,base+h*.42,z+u if axis=='z' else z),(1.4,h*.84,d+1.2) if axis=='x' else (w+1.2,h*.84,1.4))

def arcade(part,x,z,width,height,depth,columns,roof_y):
 for xx in columns:
  box(part+'.column','stone_citadel_light',(xx,50+height/2,z),(.58,height,.58))
  box(part+'.base','stone_citadel_shadow',(xx,50.13,z),(.82,.26,.82))
  box(part+'.capital','stone_citadel_light',(xx,50+height-.15,z),(.92,.35,.92))
 for a,b in zip(columns,columns[1:]):arch(part+'.vault',(a+b)/2,z,50,b-a-.6,height,.58,thickness=.22)
 box(part+'.ceiling','timber_citadel',(x,roof_y,z-.6),(width,.30,depth))
 hip(part,x,z-.6,width-1.9,depth-1.9,roof_y+.35,.55)

def gateway():
 # Original gate piers are retained as monumental flanking anchors. Human-scale
 # secondary piers frame the road without narrowing its accepted 9m width.
 for part,x,w,h in [('west-gate-anchor',148,6,12),('east-gate-anchor',194,7,10)]:
  box(part+'.body','stone_citadel',(x,44+h/2,-576),(w,h,4))
  box(part+'.cap','stone_citadel_light',(x,44+h+.2,-576),(w+.8,.5,4.7))
  for dx in [-1,1]:box(part+'.buttress','stone_citadel_shadow',(x+dx*(w/2-.35),44+h*.42,-573.65),(1.05,h*.84,1.1))
  hip(part,x,-576,w,4,44+h+.5,1.7)
 for x in [163.9,178.1]:
  box('outer-gate.pier','stone_citadel_light',(x,48.4,-576),(3,8.8,3.8))
  box('outer-gate.base','stone_citadel_shadow',(x,44.45,-576),(3.45,.9,4.1))
  box('outer-gate.capital','stone_citadel',(x,52.65,-576),(3.55,.65,4.3))
 arch('outer-gate.vault',171,-576,44,11.2,11,3.8,thickness=.55)
 # Crown/soffit stops well above the ascent. The timber gate leaves are folded
 # against flanking stonework, showing an open navigable ceremonial sequence.
 box('outer-gate.crown','stone_citadel',(171,53.65,-576),(11.2,1.7,3.8))
 box('outer-gate.coping','stone_citadel_light',(171,54.65,-576),(12.3,.42,4.6))
 for x in [164.1,178]:
  box('outer-gate.open-leaf','door_oak_citadel',(x,47.65,-577.5),(.23,5.8,3.4))
  for y in [45.3,47.6,49.9]:box('outer-gate.leaf-hinge','iron_citadel',(x, y,-577.5),(.28,.16,3.45))
 # Lower shoulders are arcaded structures between outer monuments and gateway.
 for x,a,b in [(155,151.5,160.2),(185,181.9,190.2)]:
  box('outer-gate.loggia-roof','stone_citadel',(x,52.6,-576),(b-a,.48,3.8))
  arch('outer-gate.loggia',(a+b)/2,-576,44,b-a-.4,8.3,2.4,thickness=.35)
 for x in [160,182]:
  box('outer-gate.lantern','brass_citadel',(x,50,-573.6),(.26,.9,.26))
  box('outer-gate.lantern-glow','window_warm',(x,49.95,-573.59),(.22,.58,.22))

def forecourt_span(segments=12,stone='stone_citadel',light='stone_citadel_light'):
 """Fitted closed stone deck, shallow segmental vault and anchored abutments.

 The accepted crossing stays x95..175, z-587.5..-582.5, top50. Its full
 protected 9.6m stair corridor fits between x155.1 and170.6 throughout the
 abutment depth. Minimum soffit49.5 clears the higher inclined stair edge.
 Source bounds and walking grades remain untouched. South foot extensions
 bear on the real44m gate terrace beyond the existing road clearance cut.
 """
 left,right=155.1,170.6;front,back=-582.5,-587.5;top,spring,rise=50,49.5,.3
 for part,x0,x1 in [('left',95,left),('right',right,175)]:
  box('forecourt-span.'+part+'-deck',light,((x0+x1)/2,(spring+top)/2,(front+back)/2),(x1-x0,top-spring,front-back))
 # One connected, closed curved solid, rather than camera-facing voussoirs.
 # Circular intrados supplies real depth from both street approaches and below.
 half=(right-left)/2;radius=half*half/(2*rise)+rise/2;center=(left+right)/2
 center_y=spring-math.sqrt(radius*radius-half*half)
 section=[(left+(right-left)*i/segments,center_y+math.sqrt(radius*radius-(-half+(right-left)*i/segments)**2)) for i in range(segments+1)]
 section.extend([(right,top),(left,top)])
 count=len(section);vs=[(x,y,z) for z in [back,front] for x,y in section]
 mesh('forecourt-span.vault',light,vs,[tuple(reversed(range(count))),tuple(range(count,2*count))]
  +[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)])
 for part,x0,x1 in [('left',left-1.3,left),('right',right,right+1.3)]:
  box('forecourt-span.'+part+'-abutment',stone,((x0+x1)/2,(44+spring)/2,(-587.8-581.7)/2),(x1-x0,spring-44,6.1))

def forecourt_return(mat='stone_citadel_light'):
 """Closed skew apron using the exact shared simulation world-meter contract.

 The upper crest follows the diagonal coping and the lower crest/toe bear on
 the unchanged monumental incline. Two fitted top faces preserve a gentler
 31.19/27.41-degree transition, with a true base, crest and full side closures.
 Both detail levels retain this same eight-triangle physical structure.
 """
 vertices=[tuple(RETURN_APRON['vertices'][i:i+3]) for i in range(0,len(RETURN_APRON['vertices']),3)]
 faces=[tuple(RETURN_APRON['indices'][i:i+3]) for i in range(0,len(RETURN_APRON['indices']),3)]
 mesh('forecourt-return.apron',mat,vertices,faces)

KEEP_PAVILION={'center':[185,-631.8],'coreRadius':6.1,'collarRadius':6.3,
 'coreBase':50,'coreTop':94.6,'corbelMinY':92.05,'galleryFloor':[94.6,95.15],
 'galleryRadius':9.4,'openingBase':95.7,'openingTop':100.35,'openingWidth':4.4,'openingHeight':4.15,
 'roofProfile':[[100.6,10.25],[100.86,10.55],[103.5,4.0],[104.7,.55],[105.05,.20]],'finialTop':105.8,
 'rainEnvelope':{'min':[174.25,100.35,-642.55],'max':[195.75,105.85,-621.05]},
 'loadPath':'Closed internal stone core bears at accepted floor50; eight tapered radial corbels carry the gallery plate, full-depth piers, upper ring and roof. Closed keep interiors remain inaccessible.',
 'retention':'All prior semantic architecture and public walking/collision data retained. Collar is capped at radius6.3; its conservative axial gap to retained lantern roofs is0.085641098m.'}

def octagonal_ring(part,mat,x,z,low,high,outer,inner):
 # A closed annulus, with real top/bottom and inner/outer thickness.
 vs=[(x+r*math.cos(math.pi/8+i*math.pi/4),y,z+r*math.sin(math.pi/8+i*math.pi/4))
  for r,y in [(outer,low),(outer,high),(inner,low),(inner,high)] for i in range(8)]
 faces=[]
 for i in range(8):
  n=(i+1)%8
  faces.extend([(i,n,n+8,i+8),(i+16,i+24,n+24,n+16),
   (i+8,n+8,n+24,i+24),(i,i+16,n+16,n)])
 mesh(part,mat,vs,faces)

def keep_hip_height(x,z):
 # The untouched original hip spans51.9x35.9 and rises6.7 from84.10.
 # Its six vertices/straight faces are authoritative for fitted flashing.
 dx,dz=abs(x-185),abs(z+638);half_w,half_d,ridge=25.95,17.95,3.36
 return 84.10+6.7*max(0,min(1,1-dz/half_d,1-max(0,dx-ridge)/(half_w-ridge)))

def keep_pavilion(detailed=True):
 """Additive eight-sided keep lantern, deliberately distinct from watch domes.

 No prior roof/lantern/chimney is cut, moved or simplified. The forward core
 clears retained lantern extrema; fitted flashing never exceeds radius6.3.
 Brackets sit above91.775m old roof attachments and have a continuous load
 path through the internal core to the accepted closed keep floor.
 """
 part='keep-pavilion';x,z=KEEP_PAVILION['center']
 stone='stone_citadel' if detailed else 'skyline_stone'
 light='stone_citadel_light' if detailed else 'skyline_stone'
 shadow='stone_citadel_shadow' if detailed else 'skyline_shadow'
 timber='timber_citadel' if detailed else 'skyline_timber'
 teal='teal_citadel' if detailed else 'skyline_teal'
 cylinder(part+'.bearing-core',stone,x,z,50,94.6,6.1,8,phase=math.pi/8)
 # Variable-height four-ring closed flashing, fitted to existing roof planes.
 vs=[]
 for r,lift in [(6.3,.04),(6.3,.24),(6.075,.04),(6.075,.24)]:
  for i in range(8):
   a=math.pi/8+i*math.pi/4;xx,zz=x+r*math.cos(a),z+r*math.sin(a)
   vs.append((xx,keep_hip_height(xx,zz)+lift,zz))
 faces=[]
 for i in range(8):
  n=(i+1)%8;faces.extend([(i,n,n+8,i+8),(i+16,i+24,n+24,n+16),
   (i+8,n+8,n+24,i+24),(i,i+16,n+16,n)])
 mesh(part+'.roof-collar',light,vs,faces)
 # Eight genuinely closed tapered compression brackets, not floating slabs.
 for i in range(8):
  a=math.pi/8+i*math.pi/4;nx,nz=math.cos(a),math.sin(a);tx,tz=-nz,nx
  vs=[(x+nx*r+tx*u,y,z+nz*r+tz*u) for u in [-.36,.36]
   for r,y in [(5.6,92.05),(9.4,94.08),(9.4,94.6),(5.6,94.6)]]
  mesh(part+'.corbel',stone,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)])
 cylinder(part+'.gallery-floor',light,x,z,94.6,95.15,9.8,8,phase=math.pi/8)
 # Full-width masonry bearing beneath every gallery pier; the previous9.64
 # inner radius supported only its outer toe. Outer form/counts stay fixed.
 octagonal_ring(part+'.parapet',stone,x,z,95.15,95.7,10.0,8.9)
 belfry_openings(part,x,z,95.7,100.35,9.4,4.4,4.15,segments=12 if detailed else 3,mat=light)
 cylinder(part+'.upper-band',shadow,x,z,100.1,100.35,9.6,8,phase=math.pi/8)
 cylinder(part+'.ceiling',timber,x,z,100.35,100.45,10.1,8,phase=math.pi/8)
 cylinder(part+'.cornice',light,x,z,100.45,100.6,10.3,8,phase=math.pi/8)
 profile=KEEP_PAVILION['roofProfile']
 vs=[(x+r*math.cos(math.pi/8+i*math.pi/4),y,z+r*math.sin(math.pi/8+i*math.pi/4)) for y,r in profile for i in range(8)]
 faces=[tuple(reversed(range(8))),tuple(range((len(profile)-1)*8,len(profile)*8))]
 for ring in range(len(profile)-1):
  for i in range(8):
   n=(i+1)%8;k=ring*8;faces.append((k+i,k+n,k+n+8,k+i+8))
 mesh(part+'.roof',teal,vs,faces)
 cylinder(part+'.finial','brass_citadel' if detailed else 'skyline_stone',x,z,105.05,105.8,.16,8,.045)
 cylinder(part+'.bell','iron_citadel' if detailed else 'skyline_shadow',x,z,96.1,97.55,1.25,16 if detailed else 8,.7)
 cylinder(part+'.bell','iron_citadel' if detailed else 'skyline_shadow',x,z,97.55,100.0,.15,16 if detailed else 8)
 box(part+'.bell-carrier',timber,(x,100.05,z),(4.8,.30,.32))
 if detailed:
  # Roof framing and restrained stone courses survive close all-side inspection.
  for i in range(8):
   a=math.pi/8+i*math.pi/4;nx,nz=math.cos(a),math.sin(a)
   for (lo,r0),(hi,r1) in zip(profile,profile[1:]):
    beam(part+'.roof-rib','teal_citadel_light',(x+nx*r0,lo+.035,z+nz*r0),(x+nx*r1,hi+.035,z+nz*r1),.10,.10)
  for y in [91.8,93.0,94.05]:
   for i in range(8):
    a=(i+1)*math.pi/4;normal=(math.cos(a),math.sin(a));apothem=6.1*math.cos(math.pi/8)
    facade_box(part+'.stone-course',light,x+normal[0]*apothem,z+normal[1]*apothem,normal,0,y,.055,
     2*6.1*math.sin(math.pi/8)-.05,.12,.13)

def build():
 # Keep is a civic palace/fortress with a raised hall, clerestory, corner
 # buttresses and four complete elevations, deliberately separate from M7 kit.
 shell('great-keep',185,-638,50,34,50,34,'plaster_citadel_warm',floors=[55,61,67,74,79])
 hip('great-keep',185,-638,50,34,84.10,6.7)
 door('keep-entrance',185,-620.94,(0,1),3.3,5.8)
 for x in [163,207]:
  # Small attached turrets support, rather than compete with, the main watchtower.
  cylinder('keep-corner-turret.body','stone_citadel',x,-622,73,86,2.05,10)
  dome('keep-corner-turret',x,-622,86.0,2.65,3.7,False)
 # Tall paired chimneys, narrow dormer lantern and end pinnacles break the long ridge.
 for x in [174,196]:
  box('keep.chimney','stone_citadel_shadow',(x,89,-642),(1.25,4.9,1.2))
  box('keep.chimney-cap','stone_citadel_light',(x,91.6,-642),(1.6,.35,1.6))
 for x in [176,194]:
  shell('keep-roof-lantern',x,-633,4.0,3.2,86,3.6,'plaster_citadel',floors=[])
  hip('keep-roof-lantern',x,-633,4,3.2,89.6,1.8)
 tower('watch-tower',132,-638,18,18,42,'dome',True)
 tower('west-beacon',80,-644,14,14,32,'hip')
 tower('east-beacon',245,-648,12,12,34,'dome',True)
 tower('court-bell',207,-610,12,12,27,'hip')
 tower('west-front-tower',70,-585,12,12,21,'hip')
 tower('east-front-tower',250,-585,12,12,18,'dome',False)
 shell('east-hall',235,-628,30,36,50,23)
 hip('east-hall',235,-628,30,36,73.1,6.1,ridge_axis='z')
 shell('west-court-hall',105,-620,30,20,50,20)
 hip('west-court-hall',105,-620,30,20,70.1,5.3)
 door('west-court-entrance',105,-609.92,(0,1),2.35,4.2)
 shell('east-court-hall',225,-598,30,18,50,16,'plaster_citadel_warm')
 hip('east-court-hall',225,-598,30,18,66.1,5.0)
 door('east-court-entrance',225,-588.92,(0,1),2.15,3.8)
 arcade('west-court-arcade',109,-607.7,36,5.05,4,[92,100.5,109,117.5,126],55.1)
 arcade('east-court-arcade',225,-587.6,30,4.65,3.3,[212,220,228,238],54.7)
 for part,x,z,w,d,h in [('west-curtain',60,-608,6,45,8),('east-curtain',260,-610,6,42,8),
  ('rear-curtain',165,-657,160,4,8),('west-front-curtain',107,-577,60,5,6),('east-front-curtain',231,-577,25,5,6)]:wall(part,x,z,w,d,h)
 gateway()
 forecourt_span()
 forecourt_return()
 # A small fountain uses the broad spare court without crossing authored roads.
 # It remains non-colliding decorative stone, low enough for controller autostep.
 cylinder('court-well.base','stone_citadel_shadow',175,-600,50.03,50.13,1.7,16)
 cylinder('court-well.shaft','stone_citadel',175,-600,50.13,50.95,.95,12)
 cylinder('court-well.cap','stone_citadel_light',175,-600,50.95,51.10,1.05,12)
 cylinder('court-well.water','window_citadel',175,-600,51.01,51.03,.8,12)
 keep_pavilion()

def skyline():
 """Primary semantic sculpture only, with closed body envelopes and six batches.

 Reuses deliberate hero roof/drum/cap/gate geometry rather than box roof LOD.
 Small windows, jambs, tile courses, long ribs and furniture are omitted.
 """
 global PARTS
 hero=PARTS;PARTS=defaultdict(lambda:{'vertices':[],'faces':[]})
 body_data=[('great-keep',185,-638,50,34,34),('watch-tower',132,-638,18,18,42),
  ('west-beacon',80,-644,14,14,32),('east-beacon',245,-648,12,12,34),
  ('court-bell',207,-610,12,12,27),('west-front-tower',70,-585,12,12,21),
  ('east-front-tower',250,-585,12,12,18),('east-hall',235,-628,30,36,23),
  ('west-court-hall',105,-620,30,20,20),('east-court-hall',225,-598,30,18,16)]
 for name,x,z,w,d,h in body_data:box(name+'.walls','skyline_stone' if name=='watch-tower' else 'skyline_lime',(x,50+h/2,z),(w,h,d))
 for x in [176,194]:box('keep-roof-lantern.walls','skyline_lime',(x,87.8,-633),(4,3.6,3.2))
 selected_endings=('.roof','.underside','.eaves','.hip-cap','.cap','.finial','.drum','.buttress',
  '.gallery','.merlon','.coping','.body','.chimney','.chimney-cap','.belfry.band','.belfry.cornice','.belfry.bell','.clock.dial')
 selected_exact={'outer-gate.pier','outer-gate.base','outer-gate.capital',
  'outer-gate.crown','outer-gate.coping','outer-gate.loggia-roof',
  'west-court-arcade.column','west-court-arcade.ceiling',
  'east-court-arcade.column','east-court-arcade.ceiling',
  'west-gate-anchor.cap','east-gate-anchor.cap'}
 for (part,mat),data in hero.items():
  if part.startswith(('court-well.','forecourt-span.','forecourt-return.','keep-pavilion.')) or not(part.endswith(selected_endings) or part in selected_exact):continue
  coarse='skyline_clay' if mat.startswith('terracotta') else 'skyline_teal' if mat.startswith('teal') else 'skyline_timber' if mat.startswith('timber') else 'skyline_lime' if mat.startswith('plaster') else 'skyline_shadow' if mat.endswith('shadow') or mat in ('iron_citadel','recess_citadel') else 'skyline_stone'
  mesh(part,coarse,data['vertices'],data['faces'])
 # Coarse arch tessellation preserves real passages, piers and extreme bounds.
 # The saved detailed hero retains its twelve-segment close inspection vaults.
 arch('outer-gate.vault',171,-576,44,11.2,11,3.8,mat='skyline_stone',thickness=.55,segments=6)
 for a,b in [(151.5,160.2),(181.9,190.2)]:arch('outer-gate.loggia',(a+b)/2,-576,44,b-a-.4,8.3,2.4,mat='skyline_stone',thickness=.35,segments=6)
 for part,z,height,columns in [('west-court-arcade',-607.7,5.05,[92,100.5,109,117.5,126]),('east-court-arcade',-587.6,4.65,[212,220,228,238])]:
  for a,b in zip(columns,columns[1:]):arch(part+'.vault',(a+b)/2,z,50,b-a-.6,height,.58,mat='skyline_stone',thickness=.22,segments=6)
 for part,x,z,base,top,r,width,height in [('watch-tower',132,-638,92.48,96.25,18*.435,3.4,3.27),('east-beacon',245,-648,84.48,87.1,12*.435,2.2,2.0)]:
  belfry_openings(part,x,z,base,top,r,width,height,segments=3,mat='skyline_stone')
 forecourt_span(segments=4,stone='skyline_stone',light='skyline_stone')
 forecourt_return(mat='skyline_stone')
 keep_pavilion(detailed=False)

def make_objects(asset_id='citadel.hero'):
 out=[];part_bounds={}
 collection=bpy.data.collections.new(asset_id+'.semantic-source');bpy.context.scene.collection.children.link(collection)
 for (part,mat),data in PARTS.items():
  vs=[(x-ANCHOR[0],-(z-ANCHOR[2]),y-ANCHOR[1]) for x,y,z in data['vertices']]
  data_mesh=bpy.data.meshes.new(part+'.'+mat);data_mesh.from_pydata(vs,[],data['faces']);data_mesh.update()
  bm=bmesh.new();bm.from_mesh(data_mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data_mesh);bm.free()
  obj=bpy.data.objects.new(part+'.'+mat,data_mesh);collection.objects.link(obj);obj.data.materials.append(MATERIALS[mat])
  obj['asset_id']=asset_id;obj['part']=part;obj['units']='meters';out.append(obj)
  bounds=part_bounds.setdefault(part,{'min':[float('inf')]*3,'max':[float('-inf')]*3})
  for x,y,z in data['vertices']:
   for i,v in enumerate((x-ANCHOR[0],y-ANCHOR[1],z-ANCHOR[2])):bounds['min'][i]=min(bounds['min'][i],v);bounds['max'][i]=max(bounds['max'][i],v)
 return out,part_bounds

def exported(objects,bounds,asset_id='citadel.hero'):
 by_mat=defaultdict(list);deps=bpy.context.evaluated_depsgraph_get()
 for original in objects:
  data=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps)
  obj=bpy.data.objects.new('export.'+original.name,data);bpy.context.scene.collection.objects.link(obj)
  by_mat[original.material_slots[0].material.name].append((obj,original['part']))
 out=[]
 for name,parts in by_mat.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o,_ in parts:o.select_set(True)
  obj=parts[0][0];bpy.context.view_layer.objects.active=obj
  if len(parts)>1:bpy.ops.object.join()
  names=sorted(set(p for _,p in parts));obj.name=asset_id+'.material.'+name
  obj['asset_id']=asset_id;obj['units']='meters';obj['parts']=names
  obj['part_bounds_m']=json.dumps({p:bounds[p] for p in names},separators=(',',':'));out.append(obj)
 return out

def export_asset(args,asset_id,filename,objects,bounds):
 exp=exported(objects,bounds,asset_id)
 path=os.path.join(args.output_dir,filename);bpy.ops.object.select_all(action='DESELECT')
 for obj in exp:obj.select_set(True)
 bpy.context.view_layer.objects.active=exp[0]
 result=bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_yup=True,
  export_extras=True,export_animations=False,export_apply=True,export_materials='EXPORT')
 if 'FINISHED' not in result:raise RuntimeError('Citadel GLB export failed.')
 with open(path,'rb') as f:blob=f.read()
 gltf=json.loads(blob[20:20+int.from_bytes(blob[12:16],'little')])
 triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
 minimum=[min(b['min'][i] for b in bounds.values()) for i in range(3)];maximum=[max(b['max'][i] for b in bounds.values()) for i in range(3)]
 minimum=[min(b['min'][i] for b in bounds.values()) for i in range(3)];maximum=[max(b['max'][i] for b in bounds.values()) for i in range(3)]
 entry={'id':asset_id,'path':'public/assets/citadel/'+filename,'sha256':hashlib.sha256(blob).hexdigest(),
  'bytes':len(blob),'triangles':triangles,'materialCount':len(gltf['materials']),'textureCount':0,'min':minimum,'max':maximum,
  'dimensions':[maximum[i]-minimum[i] for i in range(3)],'sourceObjects':len(objects),'partBounds':bounds}
 for obj in exp:bpy.data.objects.remove(obj,do_unlink=True)
 return entry

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output-dir',required=True);parser.add_argument('--source',required=True);parser.add_argument('--report',required=True)
 parser.add_argument('--skyline-only',action='store_true',help='Preserve shipped hero bytes and dedicated semantic source; append/rebuild only skyline collection.')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 os.makedirs(args.output_dir,exist_ok=True);os.makedirs(os.path.dirname(args.source),exist_ok=True)
 if args.skyline_only:
  if not os.path.isfile(args.source) or not os.path.isfile(args.report):raise RuntimeError('Skyline-only export requires preserved hero source/report.')
  bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.source))
  # Own only this generated skyline collection; preserve dedicated hero source.
  for c in list(bpy.data.collections):
   if c.name.startswith('citadel.skyline.semantic-source'):
    for obj in list(c.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(c)
  with open(args.report,encoding='utf-8') as f:report=json.load(f)
  report['assets']=[a for a in report['assets'] if a['id']!='citadel.skyline']
 else:
  bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
  report={'schemaVersion':1,'blenderVersion':bpy.app.version_string,'seed':None,'source':'assets/source/citadel-hero.blend',
  'generator':'tools/blender/citadel_hero.py','provenance':'Original locally authored semantic Blender architecture; no third-party assets, textures, reference pixels or services.',
  'license':'Project license unassigned; no third-party source content','pivot':'Accepted world (150,50,-605), runtime Y-up meters; one axis conversion, no corrective runtime transform.',
  'collision':'17 original M6.1 envelopes plus explicit gateway/arcade and forecourt deck/abutment proxies and one closed fitted return-apron surface, streamed before visibility; original 72 boxes, resident terrain and ascent records unchanged.',
  'lod':'Material-merged streamed detail and separately authored resident primary-architecture skyline. No compressed runtime dependency.',
  'assumptions':['Unseen elevations, closed interiors, gateways, gallery vaults, fenestration and roof framing are coherent authored interpretations of one reference image.',
  'Taller varied upper crowns and open octagonal belfries reinterpret prior proxy presentation roofs within world 106.45 m; all 17 serialized macro bodies and original walking collision boxes remain fixed.',
  'A fitted stone deck and shallow segmental vault support the existing forecourt crossing at top50m, minimum soffit49.5m; additive conservative proxies protect a9.6m skew stair opening and anchored44m terrace abutments.',
  'A closed three-meter skew apron fills the exposed diagonal return grade gap and bears on the unchanged ascent plane; its eight triangles are retained in both levels. The parent explicitly authorized a 10,000 to 10,004 resident ceiling adjustment, without removing or coarsening prior architecture.',
  'An additive eight-sided keep fore-pavilion has an internal floor50 bearing core, fitted roof collar, radial corbels above92.05m, real gallery openings and broad teal hat ending105.8m. All prior roofs, lanterns/chimneys and public collision/support remain intact; hidden internal bearing is an authored assumption.'],
  'assets':[],'collisionSurfaces':[RETURN_APRON],
  'keepPavilion':KEEP_PAVILION,'heroTriangleCeiling':95680,
  'triangleBudgetHistory':[
   {'stage':'return-apron','previous':10000,'current':10004,'reason':'Eight closed apron triangles added to9,996; four-triangle ceiling increase preserves prior architecture/tessellation.'},
   {'stage':'keep-pavilion','previous':10004,'current':11250,'reason':'Explicit parent authorization: additive complete-sided load-bearing pavilion; no old architecture removal/coarsening; same six batches and zero textures.'}],
  'residentTriangleCeiling':{'previous':10004,'current':11250,'reason':'Explicit parent authorization: at most1,200 new pavilion triangles, preserving all prior architecture; no cadence/readiness/resource-gate relaxation.'}}
 bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
 build()
 if not args.skyline_only:
  palette();objects,bounds=make_objects();report['assets'].append(export_asset(args,'citadel.hero','citadel-hero.glb',objects,bounds))
 # Prefixes deliberately avoid the close-range hero pigment pipeline. Coarse
 # sculpture uses six original colors, no texture allocation or window detail.
 old_palette=dict(PALETTE);PALETTE.clear();PALETTE.update(SKYLINE_PALETTE);palette();PALETTE.clear();PALETTE.update(old_palette)
 skyline();objects,bounds=make_objects('citadel.skyline')
 report['assets'].append(export_asset(args,'citadel.skyline','citadel-skyline.glb',objects,bounds))
 report['lod']='Material-merged streamed hero detail plus six-material resident primary-architecture skyline, hidden while detail is active.'
 for data in list(bpy.data.meshes):
  if data.users==0:bpy.data.meshes.remove(data)
 bpy.ops.object.select_all(action='DESELECT')
 for area in bpy.context.screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.clip_end=2500
 # Dedicated reproducible generated source has no manual edits; avoid a second
 # undocumented .blend1 artifact while replacing this authorized source export.
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.source))
 with open(args.report,'w',encoding='utf-8') as f:json.dump(report,f,indent=2);f.write('\n')
 print('VOXARRIUM_CITADEL: complete-sided hero exported; runtime visual review is separate.')

if __name__=='__main__':main()
