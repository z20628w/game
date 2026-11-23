import {
  _decorator, Component, Node, CapsuleCharacterController,
  EventKeyboard, EventMouse, input, Input, KeyCode, Vec3, game, Game
} from 'cc'

const { ccclass, property, requireComponent } = _decorator

/** Cocos Creator 3.8+，需 Bullet 或 PhysX；挂在脚底为原点的 Player 节点。 */
@ccclass('YunqiWalkthrough')
@requireComponent(CapsuleCharacterController)
export class YunqiWalkthrough extends Component {
  @property(Node)
  viewCamera: Node | null = null

  @property
  speed = 3

  private readonly pressed = new Set<KeyCode>()
  private readonly movement = new Vec3()
  private controller: CapsuleCharacterController | null = null
  private pitch = 0
  private yaw = 0
  private lookHeld = false
  private verticalSpeed = 0

  start() {
    this.controller = this.getComponent(CapsuleCharacterController)
    if (!this.controller) return
    this.controller.radius = 0.3
    this.controller.height = 1.1
    this.controller.center = new Vec3(0, 0.85, 0)
    this.controller.stepOffset = 0.25
    this.controller.slopeLimit = 45
    this.controller.skinWidth = 0.03
    this.yaw = this.node.eulerAngles.y
    if (this.viewCamera) this.viewCamera.setPosition(0, 1.65, 0)
  }

  onEnable() {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this)
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this)
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this)
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this)
    game.on(Game.EVENT_HIDE, this.clearInput, this)
  }

  onDisable() {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this)
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this)
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this)
    game.off(Game.EVENT_HIDE, this.clearInput, this)
    this.clearInput()
  }

  private clearInput() {
    this.pressed.clear()
    this.lookHeld = false
  }

  private onKeyDown(event: EventKeyboard) {
    this.pressed.add(event.keyCode)
    if (event.keyCode === KeyCode.KEY_R) {
      this.node.setPosition(0, 0.1, 17.8)
      this.verticalSpeed = 0
    }
  }

  private onKeyUp(event: EventKeyboard) {
    this.pressed.delete(event.keyCode)
  }

  private onMouseDown(event: EventMouse) {
    if (event.getButton() === EventMouse.BUTTON_LEFT) this.lookHeld = true
  }

  private onMouseUp(event: EventMouse) {
    if (event.getButton() === EventMouse.BUTTON_LEFT) this.lookHeld = false
  }

  private onMouseMove(event: EventMouse) {
    if (!this.lookHeld) return
    this.yaw -= event.getDeltaX() * 0.15
    this.pitch = Math.max(-80, Math.min(80, this.pitch + event.getDeltaY() * 0.15))
    this.node.setRotationFromEuler(0, this.yaw, 0)
    this.viewCamera?.setRotationFromEuler(this.pitch, 0, 0)
  }

  update(deltaTime: number) {
    if (!this.controller) return
    const dt = Math.min(deltaTime, 0.05)
    const x = Number(this.pressed.has(KeyCode.KEY_D)) - Number(this.pressed.has(KeyCode.KEY_A))
    const z = Number(this.pressed.has(KeyCode.KEY_S)) - Number(this.pressed.has(KeyCode.KEY_W))
    const length = Math.hypot(x, z) || 1
    const angle = this.yaw * Math.PI / 180
    const speed = this.speed * (this.pressed.has(KeyCode.SHIFT_LEFT) ? 1.6 : 1)
    this.verticalSpeed = this.controller.isGrounded ? -1 : Math.max(-20, this.verticalSpeed - 9.81 * dt)
    this.movement.set(
      (x * Math.cos(angle) + z * Math.sin(angle)) / length * speed * dt,
      this.verticalSpeed * dt,
      (-x * Math.sin(angle) + z * Math.cos(angle)) / length * speed * dt
    )
    this.controller.move(this.movement)
  }
}
