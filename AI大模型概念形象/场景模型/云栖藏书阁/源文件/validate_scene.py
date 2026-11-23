"""检查导出文件、贴图、真实碰撞几何和一楼到三楼的通行路径。"""
from pathlib import Path
import sys, json, math, struct
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'制作工具'/'python-packages'))
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from PIL import Image, ImageDraw, ImageFont

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'源文件'/'yunqi-library.blend'))
vertices=[]; polygons=[]
for obj in bpy.context.scene.objects:
    if not obj.name.startswith('COLLIDER_'): continue
    start=len(vertices)
    vertices.extend([obj.matrix_world@v.co for v in obj.data.vertices])
    polygons.extend([tuple(start+i for i in p.vertices) for p in obj.data.polygons])
bvh=BVHTree.FromPolygons(vertices,polygons)
errors=[]
def ray(p,d,length):
    return bvh.ray_cast(Vector(p),Vector(d),length)

points=[(0,-17.8,0),(0,-13.1,0),(0,-12.61,.15),(0,-12.01,.3),(0,-11.41,.45),
        (0,-10.81,.6),(0,-6.8,.6),(5.5,-6.8,.6),(7.2,-6.8,.6)]
for floor in [.6,4.8]:
    points.extend([(7.2,-5.4,floor),(7.9,-5.4,floor),(7.9,-5,floor),
                   (7.9,2,floor+2.1),(7.9,3.15,floor+2.1),
                   (10.1,3.15,floor+2.1),(10.1,2,floor+2.1),
                   (10.1,-5,floor+4.2),(10.1,-6.8,floor+4.2),
                   (7.2,-6.8,floor+4.2)])
points.extend([(5.3,-7,9),(5.3,0,9),(5.3,4.9,9),(0,4.9,9)])
sample_count=0; min_headroom=100
for a,b in zip(points,points[1:]):
    a,b=Vector(a),Vector(b)
    for i in range(max(2,math.ceil((b-a).length/.1))+1):
        p=a.lerp(b,i/max(2,math.ceil((b-a).length/.1)))
        sample_count+=1
        hit=ray(p+Vector((0,0,.24)),(0,0,-1),.65)
        if hit[0] is None:
            errors.append({'type':'脚下缺少地面','point':list(p)}); continue
        feet=hit[0].z
        if abs(feet-p.z)>.27: errors.append({'type':'脚下高度异常','point':list(p),'actual':feet})
        head=ray((p.x,p.y,feet+.08),(0,0,1),30)
        if head[0] is not None:
            clear=head[0].z-feet
            min_headroom=min(min_headroom,clear)
            if clear<1.85: errors.append({'type':'净高不足','point':list(p),'clearance':clear})
        for h in [.4,.9,1.6]:
            for j in range(8):
                angle=j*math.tau/8
                hit=ray((p.x,p.y,feet+h),(math.cos(angle),math.sin(angle),0),.30)
                if hit[0] is not None:
                    errors.append({'type':'身体侧向碰撞','point':list(p),'height':h}); break

gltf=json.loads((ROOT/'模型'/'yunqi-library.gltf').read_text(encoding='utf-8'))
node_names=[node.get('name','') for node in gltf.get('nodes',[])]
for required in ['L1_Floor','L2_Floor','L3_Floor','L1_Stairs','L2_Stairs','Roof']:
    if required not in node_names: errors.append({'type':'必要结构未导出','name':required})
exported_colliders=sum(name.startswith('COLLIDER_') for name in node_names)
if exported_colliders<10: errors.append({'type':'碰撞网格未完整导出','count':exported_colliders})
for entry in gltf.get('buffers',[])+gltf.get('images',[]):
    if 'uri' in entry and not (ROOT/'模型'/entry['uri']).exists():
        errors.append({'type':'导出依赖丢失','uri':entry['uri']})
tex=[]
for file in (ROOT/'贴图').glob('*'):
    with Image.open(file) as img:
        tex.append({'name':file.name,'size':list(img.size)})
        expected=4096 if '4k' in file.name else 2048
        if img.size!=(expected,expected): errors.append({'type':'贴图尺寸不符','name':file.name})
fbx=(ROOT/'模型'/'yunqi-library.fbx').read_bytes()
assert fbx.startswith(b'Kaydara FBX Binary'), 'FBX 文件头无效'
glb=(ROOT/'模型'/'yunqi-library.glb').read_bytes()
assert glb[:4]==b'glTF' and struct.unpack_from('<I',glb,4)[0]==2, 'GLB 文件头无效'
report={'状态':'通过' if not errors else '失败','通行采样数':sample_count,
        'glTF碰撞节点数':exported_colliders,
        '角色半径米':.3,'角色要求净高米':1.85,'最小实测净高米':round(min_headroom,3),
        '验证范围':'基于导出前实际碰撞网格的地面/净空/侧向射线检查，不代替 Cocos 引擎运行测试',
        'Cocos实机测试':'未执行：本目录不是 Cocos 工程，尚无引擎运行环境',
        '贴图':tex,'错误':errors[:100],'错误总数':len(errors)}
(ROOT/'验收报告.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'通行路线.json').write_text(json.dumps({'坐标系':'Cocos Y-up；单位米；这些点表示脚底位置','points':[[x,z,-y] for x,y,z in points]},ensure_ascii=False,indent=2),encoding='utf-8')

# 高清平面导览使用同一套建筑尺寸与通行线路。
font_path='C:/Windows/Fonts/msyh.ttc'
font=ImageFont.truetype(font_path,30); small=ImageFont.truetype(font_path,22); title=ImageFont.truetype(font_path,45)
image=Image.new('RGB',(2400,1400),'#f3eee1'); draw=ImageDraw.Draw(image)
draw.text((70,45),'云栖藏书阁 / 三层空间与通行导览',fill='#193e39',font=title)
draw.text((73,116),'主体 24 × 20 米  ·  层高 4.2 米  ·  东侧折返楼梯  ·  中央挑空中庭',fill='#63675c',font=font)
for index,z in enumerate([.6,4.8,9]):
    ox=410+index*790; oy=750; scale=27
    def xy(x,y): return (ox+x*scale,oy-y*scale)
    def rect(x0,y0,x1,y1,fill,outline=None,width=1):
        draw.rectangle([xy(x0,y1),xy(x1,y0)],fill=fill,outline=outline,width=width)
    rect(-12,-10,12,10,'#dcc6a2','#6b4232',7)
    draw.text((ox-250,280),['一层 · 展厅','二层 · 书房','三层 · 茶室'][index],fill='#193e39',font=font)
    if index:
        rect(-4,-3,4,3,'#f3eee1','#b38a46',4)
        draw.text((ox-80,oy-20),'中庭挑空',fill='#6b4232',font=small)
    else: draw.text((ox-75,oy-20),'通高展厅',fill='#6b4232',font=small)
    rect(6.8,-5,11.2,4.3,'#e6e0d0','#547268',2)
    for j in range(12):
        y=-5+j*7/12
        draw.line([xy(7,y),xy(8.8,y)],fill='#547268',width=2)
        draw.line([xy(9.2,y),xy(11,y)],fill='#547268',width=2)
    draw.line([xy(7.9,-5.5),xy(7.9,3.1),xy(10.1,3.1),xy(10.1,-5.5)],fill='#b54a30',width=5)
    if not index:
        draw.line([xy(-2,-10),xy(2,-10)],fill='#f3eee1',width=12)
        draw.text((ox-50,oy+290),'主入口',fill='#b54a30',font=small)
    draw.text((ox-260,1080),f'地坪标高 {z:.1f} 米',fill='#63675c',font=small)
    draw.text((ox-260,1125),['展台 / 长凳 / 中庭陈设','书架 / 阅览桌 / 环形回廊','茶桌 / 坐凳 / 观景窗'][index],fill='#63675c',font=small)
draw.text((75,1280),'红线表示楼梯方向；本图为导览示意，精确碰撞与家具布置以模型为准。',fill='#63675c',font=small)
image.save(ROOT/'预览'/'07-楼层导览.png')
print(json.dumps({k:v for k,v in report.items() if k not in ['贴图','错误']},ensure_ascii=False,indent=2))
if errors:
    print(json.dumps(errors[:15],ensure_ascii=False,indent=2)); sys.exit(1)
