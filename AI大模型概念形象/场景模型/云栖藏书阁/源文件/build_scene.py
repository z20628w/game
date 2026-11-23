"""生成原创三层中式藏书阁。使用 Python 3.13、bpy 5.1、numpy、Pillow。"""
from pathlib import Path
import sys, math, json, random, argparse, os, tempfile

ROOT = Path(__file__).resolve().parents[1]
DEPS = ROOT.parent / '制作工具' / 'python-packages'
TEMP_DIR = ROOT.parent / '制作工具' / '临时文件'
TEMP_DIR.mkdir(parents=True,exist_ok=True)
tempfile.tempdir = str(TEMP_DIR)
if DEPS.exists():
    sys.path.insert(0, str(DEPS))
import bpy
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from mathutils import Vector

random.seed(42)
TEXTURES = ROOT / '贴图'
MODELS = ROOT / '模型'
PREVIEWS = ROOT / '预览'
for folder in [TEXTURES, MODELS, PREVIEWS]:
    folder.mkdir(exist_ok=True)

def create_textures():
    """四种 4K 平铺颜色贴图，以及对应 2K 法线与粗糙度图。"""
    for name, base in [('wood', (98, 56, 31)), ('redwood', (132, 35, 25)),
                       ('stone', (162, 164, 151)), ('plaster', (218, 207, 176))]:
        target = TEXTURES / f'{name}_basecolor_4k.jpg'
        if target.exists():
            continue
        n = 4096
        y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n
        rng = np.random.default_rng(38)
        noise = rng.normal(0, 0.7, (n, n)).astype(np.float32)
        if 'wood' in name:
            grain = np.sin(2*np.pi*(x*70 + 0.22*np.sin(y*2*np.pi)*np.sin(x*2*np.pi)))
            fine = np.sin(2*np.pi*(x*211 + 0.18*np.sin(y*6*np.pi)))
            seams = (np.mod(x*6, 1) < 0.014) | ((np.mod(y*2 + np.floor(x*6)*0.5, 1)) < 0.006)
            h = 0.5 + grain*0.055 + fine*0.018 - seams*0.25
            tone = grain*5 + fine*2 + noise - seams*28
        elif name == 'stone':
            seams = (np.mod(y*4, 1) < .016) | (np.mod(x*4 + np.floor(y*4)*.5, 1) < .016)
            waves = np.sin(x*12*np.pi)*np.sin(y*8*np.pi)
            h = .5 + waves*.04 + noise*.008 - seams*.25
            tone = noise*2 + waves*5 - seams*32
        else:
            h = .5 + noise*.008
            tone = noise*1.4 + np.sin(x*8*np.pi)*np.cos(y*6*np.pi)*1.5
        rgb = np.clip(np.array(base)[None,None,:] + tone[:,:,None], 0, 255).astype('uint8')
        Image.fromarray(rgb).save(target, quality=94)
        dx = (np.roll(h,-1,1)-np.roll(h,1,1))*3
        dy = (np.roll(h,-1,0)-np.roll(h,1,0))*3
        norm = np.stack([-dx,dy,np.ones_like(h)],axis=-1)
        norm /= np.linalg.norm(norm,axis=-1,keepdims=True)
        Image.fromarray(np.uint8((norm*.5+.5)*255)).resize((2048,2048),Image.Resampling.LANCZOS).save(TEXTURES / f'{name}_normal_2k.png')
        rough = np.clip(190 + tone*.35, 130, 240).astype('uint8')
        Image.fromarray(rough).resize((2048,2048),Image.Resampling.LANCZOS).save(TEXTURES / f'{name}_roughness_2k.png')

create_textures()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
MATERIALS = []
def material(name, color, texture=None, metallic=0, rough=.6, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    if emission:
        p.inputs['Emission Color'].default_value = (*color,1)
        p.inputs['Emission Strength'].default_value = emission
    if texture:
        for channel, suffix in [('Base Color','basecolor_4k.jpg'),('Roughness','roughness_2k.png'),('Normal','normal_2k.png')]:
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(TEXTURES / f'{texture}_{suffix}'),check_existing=True)
            tex.interpolation = 'Linear'
            tex.extension = 'REPEAT'
            if channel != 'Base Color':
                tex.image.colorspace_settings.name = 'Non-Color'
            if channel == 'Normal':
                normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
                normal.inputs['Strength'].default_value = .3
                mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
                mat.node_tree.links.new(normal.outputs['Normal'],p.inputs[channel])
            else:
                mat.node_tree.links.new(tex.outputs['Color'],p.inputs[channel])
    MATERIALS.append(mat)
    return len(MATERIALS)-1

WOOD = material('Dark_Teak_4K',(.3,.15,.07),'wood')
RED = material('Vermilion_Wood_4K',(.5,.08,.04),'redwood')
STONE = material('Limestone_4K',(.6,.6,.53),'stone')
PLASTER = material('Warm_Plaster_4K',(.8,.77,.65),'plaster')
ROOF = material('Jade_Glazed_Tiles',(.035,.18,.13),metallic=.16,rough=.26)
GOLD = material('Aged_Brass',(.65,.39,.10),metallic=.65,rough=.3)
INK = material('Deep_Blue_Green',(.025,.09,.095))
PAPER = material('Warm_Paper',(.82,.70,.44),rough=.85)
LIGHT = material('Lantern_Glow',(.95,.52,.16),rough=.65,emission=.35)
GREEN = material('Pine_Leaves',(.10,.23,.11),rough=.85)
WATER = material('Jade_Water',(.025,.16,.16),metallic=.4,rough=.15)

groups = {}
collision_groups = {}
def bucket(group, coll=False):
    store = collision_groups if coll else groups
    return store.setdefault(group, {'v':[], 'f':[], 'uv':[], 'm':[]})

def face(group, pts, mat, uv=None, coll=False):
    b = bucket(group,coll)
    i = len(b['v'])
    b['v'].extend(pts)
    b['f'].append(tuple(range(i,i+len(pts))))
    if uv is None:
        a = Vector(pts[1])-Vector(pts[0]); c = Vector(pts[-1])-Vector(pts[0])
        uv = [(0,0),(a.length/2,0),(a.length/2,c.length/2),(0,c.length/2)][:len(pts)]
    b['uv'].extend(uv)
    b['m'].append(mat)

def box(group, center, size, mat, coll=False, angle=0, visual=True):
    x,y,z = center
    sx,sy,sz = [s/2 for s in size]
    pts = []
    for px,py,pz in [(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]:
        pts.append((x+px*math.cos(angle)-py*math.sin(angle),y+px*math.sin(angle)+py*math.cos(angle),z+pz))
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        if visual: face(group,[pts[i] for i in ids],mat)
        if coll: face(group,[pts[i] for i in ids],0,coll=True)

def beam(group,a,b,width,depth,mat,coll=False,visual=True):
    a,b = Vector(a),Vector(b)
    direction = (b-a).normalized()
    u = direction.cross(Vector((0,0,1)))
    if u.length < .01: u = Vector((1,0,0))
    u.normalize(); v = direction.cross(u).normalized()
    pts = [tuple(p+u*su*width/2+v*sv*depth/2) for p in [a,b] for su,sv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        if visual: face(group,[pts[i] for i in ids],mat)
        if coll: face(group,[pts[i] for i in ids],0,coll=True)

def cylinder(group, center, radius, height, mat, n=16, rtop=None, coll=False):
    x,y,z=center; rtop = radius if rtop is None else rtop
    bottom=[(x+radius*math.cos(i*math.tau/n),y+radius*math.sin(i*math.tau/n),z-height/2) for i in range(n)]
    top=[(x+rtop*math.cos(i*math.tau/n),y+rtop*math.sin(i*math.tau/n),z+height/2) for i in range(n)]
    for i in range(n):
        j=(i+1)%n
        face(group,[bottom[i],bottom[j],top[j],top[i]],mat,[(i/n,0),((i+1)/n,0),((i+1)/n,height/2),(i/n,height/2)])
    face(group,list(reversed(bottom)),mat,[(0,0)]*n)
    face(group,top,mat,[(0,0)]*n)
    if coll: box(group,center,(radius*2,radius*2,height),mat,coll=True,visual=False)

def rail(group,a,b):
    a,b=Vector(a),Vector(b)
    for h,w in [(.25,.10),(.92,.12),(1.05,.15)]:
        beam(group,a+Vector((0,0,h)),b+Vector((0,0,h)),w,w,RED)
    for i in range(max(2,int((b-a).length/.5))+1):
        p=a.lerp(b,i/max(2,int((b-a).length/.5)))
        beam(group,p,p+Vector((0,0,1.05)),.07,.07,RED)
    # 稀疏碰撞护栏，保持中庭与楼梯边缘不可穿越。
    beam(group,a+Vector((0,0,.55)),b+Vector((0,0,.55)),.14,1.1,RED,coll=True,visual=False)

def slope(group,x0,x1,y0,y1,z0,z1):
    pts=[(x0,y0,z0-.15),(x1,y0,z0-.15),(x1,y1,z1-.15),(x0,y1,z1-.15),
         (x0,y0,z0),(x1,y0,z0),(x1,y1,z1),(x0,y1,z1)]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        if y1<y0: ids=tuple(reversed(ids))
        face(group,[pts[i] for i in ids],0,coll=True)

def lantern(group,x,y,z):
    cylinder(group,(x,y,z+.48),.025,.55,GOLD,n=8)
    cylinder(group,(x,y,z),.24,.52,LIGHT,n=8)
    cylinder(group,(x,y,z+.29),.30,.08,WOOD,n=8)
    cylinder(group,(x,y,z-.29),.30,.08,WOOD,n=8)
    for i in range(8):
        a=i*math.tau/8
        beam(group,(x+.242*math.cos(a),y+.242*math.sin(a),z-.26),(x+.242*math.cos(a),y+.242*math.sin(a),z+.26),.024,.024,WOOD)
    cylinder(group,(x,y,z-.43),.035,.23,RED,n=8)

def table(group,x,y,z,w=2.1,d=1.1):
    box(group,(x,y,z+.81),(w,d,.12),WOOD,coll=True)
    box(group,(x,y,z+.68),(w-.1,d-.1,.18),WOOD)
    for dx in [-w/2+.12,w/2-.12]:
        for dy in [-d/2+.12,d/2-.12]:
            box(group,(x+dx,y+dy,z+.37),(.12,.12,.74),WOOD)

def shelf(group,x,y,z,w=2.5):
    box(group,(x,y,z+1.25),(w,.5,2.5),WOOD,coll=True,visual=False)
    box(group,(x,y+.22,z+1.25),(w,.08,2.5),WOOD)
    for dx in [-w/2,w/2]: box(group,(x+dx,y,z+1.25),(.12,.55,2.5),WOOD)
    for level in range(6):
        h=z+.1+level*.47
        box(group,(x,y,h),(w,.58,.08),WOOD)
        if level==5: continue
        for j in range(12):
            bx=x-w/2+.2+j*(w-.35)/12
            box(group,(bx,y-.02,h+.21),(.09+random.random()*.04,.34,.31+random.random()*.06),[PAPER,INK,RED][j%3])
            box(group,(bx,y-.195,h+.24),(.065,.012,.13),PAPER)

# 地面、石台、入口坡道。主楼地坪标高 0.6 米。
box('Site',(0,0,-.18),(38,40,.36),STONE,coll=True)
box('Platform',(0,0,.22),(26,22,.44),STONE,coll=True)
box('L1_Floor',(0,0,.49),(24,20,.22),STONE,coll=True)
for i in range(4):
    box('Entrance',(0,-12.6+i*.6,.075*(i+1)),(7,.6,.15*(i+1)),STONE,coll=True)
# 无障碍侧坡道：沿南北方向进入正门前石台。
for ids in [(0,1,2,3),(3,2,5,4),(0,4,5,1),(0,3,4),(1,5,2)]:
    pts=[(4,-16,0),(6.5,-16,0),(6.5,-10.9,.6),(4,-10.9,.6),(4,-10.9,0),(6.5,-10.9,0)]
    face('Entrance',[pts[i] for i in ids],STONE,[(0,0)]*len(ids))
slope('Entrance',4,6.5,-16,-10.9,0,.6)

FLOORS=[.6,4.8,9.0]
for level,z in enumerate(FLOORS,1):
    group=f'L{level}_Structure'
    if level>1:
        # 将楼板按中庭和楼梯井边界切分；绝不使用覆盖整层的碰撞盒。
        xs=[-12,-4,4,6.8,11.2,12]; ys=[-10,-5,-3,3,4.3,10]
        for a,b in zip(xs,xs[1:]):
            for c,d in zip(ys,ys[1:]):
                mx,my=(a+b)/2,(c+d)/2
                if (-4<mx<4 and -3<my<3) or (6.8<mx<11.2 and -5<my<4.3): continue
                box(f'L{level}_Floor',(mx,my,z-.13),(b-a,d-c,.26),WOOD,coll=True)
        for a,b in [((-4,-3,z),(4,-3,z)),((4,-3,z),(4,3,z)),((4,3,z),(-4,3,z)),((-4,3,z),(-4,-3,z))]:
            rail(f'L{level}_Railings',a,b)
        for a,b in [((6.8,-5,z),(6.8,4.3,z)),((6.8,4.3,z),(11.2,4.3,z)),((11.2,4.3,z),(11.2,-5,z))]:
            rail(f'L{level}_Railings',a,b)
    # 柱梁与三面外墙；窗洞具有真实厚度且无玻璃封堵。
    for x in [-12,-8,-4,0,4,8,12]:
        for y in [-10,10]:
            if y==-10 and x==0: continue
            cylinder(group,(x,y,z+1.87),.22,3.74,RED,n=20,coll=True)
            cylinder(group,(x,y,z+.1),.32,.2,STONE,n=16)
            cylinder(group,(x,y,z+3.55),.29,.16,GOLD,n=16)
    for x in [-12,12]:
        for y in [-6,-2,2,6]: cylinder(group,(x,y,z+1.87),.22,3.74,RED,n=20,coll=True)
    for y in [-10,10]: box(group,(0,y,z+3.65),(24.5,.42,.4),RED,coll=True)
    for x in [-12,12]: box(group,(x,0,z+3.65),(.42,20,.4),RED,coll=True)
    for y in [-6,6]: box(group,(0,y,z+3.65),(24,.22,.28),WOOD)
    for y in [-10,10]:
        for x in [-10,-6,-2,2,6,10]:
            if y==-10 and abs(x)==2:
                if level==1:
                    box(group,(x+(-1 if x<0 else 1),y,z+1.7),(1.7,.24,3.4),RED,coll=True)
                else:
                    rail(group,(x-1.8,y,z),(x+1.8,y,z))
                continue
            box(group,(x,y,z+.56),(3.6,.25,1.12),PLASTER,coll=True)
            box(group,(x,y,z+3.28),(3.6,.25,.52),PLASTER,coll=True)
            for dx in [-1.8,1.8]: box(group,(x+dx,y,z+2),(.12,.32,2),RED,coll=True)
            for h in [1.17,2.95]: box(group,(x,y,z+h),(3.6,.32,.12),RED)
            for j in range(9): box(group,(x-1.6+j*.4,y,z+2.07),(.045,.10,1.7),WOOD)
            for h in [1.62,2.07,2.52]: box(group,(x,y,z+h),(3.55,.1,.045),WOOD)
            box(group,(x,y,z+2.07),(3.6,.12,1.8),WOOD,coll=True,visual=False)
    for x in [-12,12]:
        for y in [-8,-4,0,4,8]:
            box(group,(x,y,z+.56),(.25,3.6,1.12),PLASTER,coll=True)
            box(group,(x,y,z+3.28),(.25,3.6,.52),PLASTER,coll=True)
            for dy in [-1.8,1.8]: box(group,(x,y+dy,z+2),(.32,.12,2),RED,coll=True)
            for h in [1.17,2.95]: box(group,(x,y,z+h),(.32,3.6,.12),RED)
            for j in range(9): box(group,(x,y-1.6+j*.4,z+2.07),(.1,.045,1.7),WOOD)
            for h in [1.62,2.07,2.52]: box(group,(x,y,z+h),(.1,3.55,.045),WOOD)
            box(group,(x,y,z+2.07),(.12,3.6,1.8),WOOD,coll=True,visual=False)
    for x in [-8,-4,4,8]:
        for y in [-6,6]:
            cylinder(group,(x,y,z+1.8),.17,3.6,RED,n=16,coll=True)
            lantern(f'L{level}_Decor',x,y,z+2.9)
    # 彩绘额枋与斗拱，保持在通行头部空间上方。
    for y in [-10.2,10.2]:
        box(group,(0,y,z+3.48),(24,.12,.16),INK)
        for x in range(-11,12,2):
            for h,w in [(3.75,.65),(3.93,1.0)]:
                box(group,(x,y,z+h),(w,.65,.14),RED)
            box(group,(x,y,z+3.5),(.35,.16,.1),GOLD)

# 两组真实折返阶梯，净宽 1.8 米，层间高差 4.2 米。
for level,z in enumerate(FLOORS[:2],1):
    group=f'L{level}_Stairs'
    for i in range(12):
        h=(i+1)*2.1/12
        box(group,(7.9,-5+(i+.5)*7/12,z+h-.09),(1.8,7/12+.008,.18),WOOD)
        box(group,(10.1,2-(i+.5)*7/12,z+2.1+h-.09),(1.8,7/12+.008,.18),WOOD)
    slope(group,7,8.8,-5,2,z,z+2.1)
    slope(group,9.2,11,2,-5,z+2.1,z+4.2)
    box(group,(9,3.15,z+2.1-.13),(4,2.3,.26),WOOD,coll=True)
    for a,b in [((7,-5,z),(7,2,z+2.1)),((8.8,-5,z),(8.8,2,z+2.1)),((9.2,2,z+2.1),(9.2,-5,z+4.2)),((11,2,z+2.1),(11,-5,z+4.2)),((7,4.2,z+2.1),(11,4.2,z+2.1))]:
        rail(group,a,b)

# 一层展厅：展柜、长凳和中央青铜陈设。
for x in [-7.2,6]:
    for y in [-7.8,7.8]:
        table('L1_Furniture',x,y,.6,2.2,1)
        for dx in [-.5,.5]:
            cylinder('L1_Furniture',(x+dx,y,1.69),.18,.35,INK,n=16,rtop=.10)
for x in [-8.5,-5]:
    table('L1_Furniture',x,0,.6,2,1)
    box('L1_Furniture',(x,-1.2,.99),(1.8,.4,.18),WOOD,coll=True)
    for dx in [-.65,.65]: box('L1_Furniture',(x+dx,-1.2,.75),(.16,.3,.3),WOOD)
cylinder('L1_Furniture',(0,1.5,.85),1.05,.5,STONE,n=32,coll=True)
cylinder('L1_Furniture',(0,1.5,1.3),.65,.4,GOLD,n=32,rtop=.9)
cylinder('L1_Furniture',(0,1.5,1.6),.75,.2,INK,n=32,rtop=.45)

# 二层书房：两侧书架和通道外的阅览桌。
for x in [-9,-5,-1,3,8.5]: shelf('L2_Furniture',x,8.9,4.8,2.5)
for x in [-9,-5]:
    shelf('L2_Furniture',x,-8.8,4.8,2.6)
    for y in [-5,1,5]:
        table('L2_Furniture',x,y,4.8,1.8,.95)
        box('L2_Furniture',(x,y-.95,5.21),(1.4,.35,.18),WOOD,coll=True)
        for dx in [-.5,.5]: box('L2_Furniture',(x+dx,y-.95,4.96),(.14,.25,.32),WOOD)
        box('L2_Furniture',(x,y,5.69),(.5,.34,.04),PAPER)

# 三层茶室，沿北面与西面布置，保留楼梯通往中央回廊的路径。
for x in [-8,-2,4]:
    table('L3_Furniture',x,7.1,9,2.1,1.2)
    for dx in [-.65,.65]:
        for dy in [-1.2,1.2]:
            cylinder('L3_Furniture',(x+dx,7.1+dy,9.25),.3,.5,WOOD,n=16,coll=True)
    for dx in [-.5,0,.5]: cylinder('L3_Furniture',(x+dx,7.1,9.96),.075,.16,INK,n=12)
shelf('L3_Furniture',-8,-8.7,9,3)
for y in [-4,1]: table('L3_Furniture',-8,y,9,2,1.1)

def roof_surface(group,x_half,y_half,z,raise_height,inner=None):
    # 四面曲面攒尖式屋顶，外沿翘起；低层为檐带，顶层封顶。
    inner = inner or (2.4,1.8)
    rings=12
    def point(side,t,u):
        xh=x_half+(inner[0]-x_half)*t
        yh=y_half+(inner[1]-y_half)*t
        h=z+raise_height*(t**1.5)+.20*((1-t)**5)+.25*(abs(u)**6)*(1-t)
        if side==0: return (u*xh,-yh,h)
        if side==1: return (xh,u*yh,h)
        if side==2: return (-u*xh,yh,h)
        return (-xh,-u*yh,h)
    for side in range(4):
        count=int((x_half if side%2==0 else y_half)*2/.32)
        for j in range(count):
            u0=-1+2*j/count; u1=-1+2*(j+1)/count
            for k in range(rings):
                t0=k/rings; t1=(k+1)/rings
                p=[point(side,t0,u0),point(side,t0,u1),point(side,t1,u1),point(side,t1,u0)]
                face(group,p,ROOF,[(0,0),(1,0),(1,1),(0,1)])
                # 底板使用相同曲面分段，避免大平面穿出翘曲的瓦面。
                face(group,[(x,y,h-.08) for x,y,h in reversed(p)],WOOD)
                # 瓦垄采用真实几何，不依赖远距离贴图。
                a=Vector(point(side,t0,u0)); b=Vector(point(side,t1,u0))
                beam(group,a+Vector((0,0,.035)),b+Vector((0,0,.035)),.055,.055,ROOF)
            a=point(side,0,u0); b=point(side,0,u1)
            beam(group,a,b,.09,.10,GOLD)
        for t in [0,.27,.54,.78,1]:
            for j in range(24):
                a=point(side,t,-1+2*j/24); b=point(side,t,-1+2*(j+1)/24)
                beam(group,a,b,.035,.035,ROOF)
        for k in range(rings):
            beam(group,point(side,k/rings,-1),point(side,(k+1)/rings,-1),.13,.13,GOLD)

for level,z in enumerate(FLOORS[:2],1):
    roof_surface(f'L{level}_Eaves',13.4,11.4,z+3.65,.55,(11.9,9.9))
roof_surface('Roof',14,12,12.8,3.6)
box('Roof',(0,0,16.4),(4.8,3.6,.16),ROOF)
beam('Roof',(-3.3,0,16.65),(3.3,0,16.65),.3,.3,GOLD)
for x in [-3.4,3.4]:
    beam('Roof',(x,0,16.5),(x*1.07,0,17.1),.25,.25,ROOF)
    beam('Roof',(x*1.07,0,17.1),(x*1.2,0,17.35),.18,.18,GOLD)

# 前庭两座浅池与几何松树。
for x in [-12,12]:
    box('Garden',(x,-15,.15),(4.5,5,.3),INK,coll=True)
    box('Garden',(x,-15,.32),(4.1,4.6,.04),WATER)
    for dx in [-2.2,2.2]: box('Garden',(x+dx,-15,.4),(.22,5,.4),STONE,coll=True)
    for dy in [-2.5,2.5]: box('Garden',(x,-15+dy,.4),(4.5,.22,.4),STONE,coll=True)
for x in [-16,16]:
    for y in [-8,8]:
        cylinder('Garden',(x,y,1.8),.20,3.6,WOOD,n=12,coll=True)
        for h,r in [(2.4,1.8),(3.2,1.5),(3.9,1.1)]:
            cylinder('Garden',(x,y,h),r,1.1,GREEN,n=12,rtop=.25)

def make_object(name,data,collision=False):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(data['v'],[],data['f']); mesh.update()
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj)
    if collision:
        obj.data.materials.append(MATERIALS[INK]); obj.hide_render=True
        obj.display_type='WIRE'
        obj['purpose']='静态非凸碰撞；楼梯使用平滑斜坡；运行时禁用 MeshRenderer'
    else:
        for m in MATERIALS: mesh.materials.append(m)
        for poly,idx in zip(mesh.polygons,data['m']): poly.material_index=idx
        uv=mesh.uv_layers.new(name='UVMap')
        for i,coords in enumerate(data['uv']): uv.data[i].uv=coords
        obj['purpose']='可视模型，按楼层拆分'
    return obj

visuals=[make_object(name,data) for name,data in groups.items()]
colliders=[make_object('COLLIDER_'+name,data,True) for name,data in collision_groups.items()]

# 门额的可编辑文字最终转换为网格，Cocos 不依赖字体。
font_path=Path('C:/Windows/Fonts/msyh.ttc')
if font_path.exists():
    font=bpy.data.fonts.load(str(font_path))
    curve=bpy.data.curves.new('云栖藏书阁','FONT'); curve.body='云 栖 藏 书 阁'
    curve.font=font; curve.size=.43; curve.align_x='CENTER'; curve.extrude=.008
    text=bpy.data.objects.new('Entrance_Plaque_Text',curve); scene.collection.objects.link(text)
    text.location=(0,-10.30,3.56); text.rotation_euler=(math.pi/2,0,0)
    curve.materials.append(MATERIALS[GOLD])
    bpy.context.view_layer.objects.active=text; text.select_set(True)
    bpy.ops.object.convert(target='MESH'); text.select_set(False)
    visuals.append(text)
box('Plaque',(0,-10.22,3.8),(4.2,.16,.7),INK)
visuals.append(make_object('Plaque',groups['Plaque']))

# 模型统计与引擎坐标：glTF 导出将 (x,y,z) 转换为 (x,z,-y)。
for obj in visuals+colliders: obj.data.calc_loop_triangles()
for obj in visuals+colliders:
    obj.modifiers.new(name='Export_Triangles',type='TRIANGULATE')
stats={
    '名称':'云栖藏书阁', '性质':'原创中式建筑，不是故宫复原',
    '楼层数':3,'楼层地坪米':FLOORS,'建筑主体尺寸米':[24,20,17.35],
    '可视三角形':sum(len(o.data.loop_triangles) for o in visuals),
    '碰撞三角形':sum(len(o.data.loop_triangles) for o in colliders),
    '可视对象数':len(visuals),'碰撞对象数':len(colliders),'材质数':len(MATERIALS),
    '坐标系':'导出为右手 Y-up，1 单位为 1 米；Cocos 正门位于 +Z 方向',
    '出生点Cocos':[0,.1,17.8], '建议相机局部位置':[0,1.65,0],
    '楼梯净宽米':1.8,'台阶高度米':.175,'主门洞宽米':4.3,
    '贴图':'4 组 4096×4096 BaseColor、2048×2048 Normal/Roughness；屋瓦为几何细节',
    '第三方美术资产':'无；所有几何和材质由脚本生成；门额文字使用系统微软雅黑字形',
}
(ROOT/'模型参数.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')

# FBX 与 glTF 均导出真实模型；灯光和预览相机不进入模型。
bpy.ops.object.select_all(action='DESELECT')
for obj in visuals+colliders: obj.select_set(True)
bpy.context.view_layer.objects.active=visuals[0]
bpy.ops.export_scene.fbx(filepath=str(MODELS/'yunqi-library.fbx'),use_selection=True,
    object_types={'MESH'},axis_forward='-Z',axis_up='Y',apply_unit_scale=True,
    bake_space_transform=True,path_mode='COPY',embed_textures=True,add_leaf_bones=False,
    use_mesh_modifiers=True,bake_anim=False)
bpy.ops.export_scene.gltf(filepath=str(MODELS/'yunqi-library.gltf'),export_format='GLTF_SEPARATE',
    use_selection=True,export_texture_dir='textures',export_yup=True,export_extras=True,
    export_materials='EXPORT',export_cameras=False,export_lights=False,export_tangents=True,export_apply=True)
bpy.ops.export_scene.gltf(filepath=str(MODELS/'yunqi-library.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT',export_tangents=True,export_apply=True)

# 预览使用同一份交付几何，所有碰撞网格保持不可见。
world=bpy.data.worlds.new('Soft_Daylight'); scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.52,.64,.75,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.55
def area(name,location,power,size,color=(1,.87,.68)):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=color
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location
    return obj
sun_data=bpy.data.lights.new('Sun','SUN'); sun_data.energy=2.3; sun_data.angle=.12
sun=bpy.data.objects.new('Sun',sun_data); scene.collection.objects.link(sun); sun.rotation_euler=(.45,-.6,-.35)
area('Large_Softbox',(0,-9,24),2200,18)
for z in FLOORS:
    for x,y in [(-6,-5),(5,-6),(-6,6),(5,6),(0,0)]: area(f'Interior_{z}_{x}_{y}',(x,y,z+3.1),210,3)
camera_data=bpy.data.cameras.new('PreviewCamera'); camera=bpy.data.objects.new('PreviewCamera',camera_data)
scene.collection.objects.link(camera); scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX'
    prefs.get_devices()
    gpu_found=False
    for device in prefs.devices:
        device.use=device.type!='CPU'
        gpu_found=gpu_found or device.use
    if gpu_found: scene.cycles.device='GPU'
except Exception:
    scene.cycles.device='CPU'
scene.render.resolution_x=1600; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
def view(name,location,target,lens=40,hide=None,ortho=None):
    for obj in visuals: obj.hide_render=False
    if hide:
        for obj in visuals:
            if hide(obj.name): obj.hide_render=True
    camera.location=location; camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=lens; camera.data.type='ORTHO' if ortho else 'PERSP'
    if ortho: camera.data.ortho_scale=ortho
    scene.render.filepath=str(PREVIEWS/name)
    bpy.ops.render.render(write_still=True)

camera.location=(34,-42,28); camera.rotation_euler=(Vector((0,0,6))-camera.location).to_track_quat('-Z','Y').to_euler()
for image in bpy.data.images:
    if image.filepath and Path(bpy.path.abspath(image.filepath)).is_file():
        image.filepath=bpy.path.relpath(image.filepath,start=str(ROOT/'源文件'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'源文件'/'yunqi-library.blend'))
if '--no-render' not in sys.argv:
    view('01-建筑外观.png',(34,-43,29),(0,0,6),ortho=52)
    view('02-一层入口与中庭.png',(1,-9,2.25),(-1,4,3),lens=19)
    view('03-二层书房.png',(-2.7,-7.5,6.45),(-8,5,6.6),lens=20)
    view('04-折返楼梯.png',(5,-7,6.4),(9,0,7.2),lens=18)
    view('05-三层茶室.png',(-1.2,4.3,10.65),(-7,7.6,10.1),lens=22)
    view('06-三层结构剖视.png',(32,-38,31),(0,0,5.5),ortho=46,
        hide=lambda name: name=='Roof' or name.endswith('_Eaves') or name.endswith('_Structure'))
    for obj in visuals: obj.hide_render=False
print(json.dumps(stats,ensure_ascii=False,indent=2))
