import { _decorator, Component, MeshCollider, MeshRenderer, warn } from 'cc'

const { ccclass } = _decorator

/** 挂在导入的模型根节点；COLLIDER_ 网格仅用于静态碰撞。 */
@ccclass('YunqiColliders')
export class YunqiColliders extends Component {
  onLoad() {
    let count = 0
    for (const renderer of this.node.getComponentsInChildren(MeshRenderer)) {
      // FBX/glTF 导入器可能在原始对象节点下生成子网格节点。
      let current = renderer.node
      let isCollider = false
      while (current) {
        if (current.name.startsWith('COLLIDER_')) {
          isCollider = true
          break
        }
        if (current === this.node) break
        current = current.parent!
      }
      if (!isCollider) continue
      renderer.enabled = false
      if (!renderer.mesh) {
        warn(`碰撞网格未加载：${renderer.node.name}`)
        continue
      }
      const collider = renderer.node.getComponent(MeshCollider)
        ?? renderer.node.addComponent(MeshCollider)
      collider.convex = false
      collider.mesh = renderer.mesh
      count += 1
    }
    if (!count) warn('没有找到 COLLIDER_ 网格，请把组件挂到完整模型的根节点')
  }
}
