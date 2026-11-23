"use strict";
var LaunchCanvasGallery = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/gallery-motion.ts
  var gallery_motion_exports = {};
  __export(gallery_motion_exports, {
    createGalleryScene: () => createGalleryScene
  });

  // src/linked-motion.ts
  var clamp = (n) => Math.max(0, Math.min(1, n));
  var ease = (a, b, value) => {
    const p = clamp((value - a) / (b - a));
    return p * p * (3 - 2 * p);
  };
  var pulse = (start, peak, end, p) => ease(start, peak, p) * (1 - ease(peak, end, p));
  var hands = {
    chatgpt: [[0.82, 0.28], [0.79, 0.46]],
    claude: [[0.65, 0.28], [0.75, 0.47]],
    gemini: [[0.83, 0.31], [0.82, 0.58]],
    deepseek: [[0.82, 0.28], [0.84, 0.58]],
    doubao: [[0.63, 0.58], [0.74, 0.57]],
    qwen: [[0.6, 0.3], [0.78, 0.58]],
    kimi: [[0.66, 0.25], [0.72, 0.56]],
    grok: [[0.6, 0.4], [0.78, 0.67]],
    seed: [[0.7, 0.29], [0.81, 0.6]],
    copilot: [[0.81, 0.33], [0.78, 0.57]],
    perplexity: [[0.6, 0.32], [0.77, 0.6]],
    minimax: [[0.58, 0.32], [0.81, 0.57]]
  };
  function poseAt(model, p, anime) {
    const ready = ease(0, 0.16, p), gesture = pulse(0.13, 0.34, 0.85, p), action = pulse(0.28, 0.49, 0.81, p), settle = 1 - ease(0.82, 1, p), amplitude = anime ? 1 : 0.55;
    const pose = { x: (1 - ready) * 0.018, y: (1 - ready) * 0.018, lean: Math.sin(p * 9) * 0.012 * settle, head: -0.055 * gesture, handX: -0.013 * gesture, handY: -0.025 * gesture, prop: 0, wing: 0, wind: 0 };
    switch (model) {
      case "chatgpt":
        pose.y = anime ? -0.065 * (1 - ready) + Math.sin(p * 38) * 3e-3 * (1 - ready) : pose.y;
        pose.wing = Math.sin(p * 48) * 0.05 * (1 - ready) + Math.sin(p * 13) * 8e-3 * settle;
        pose.wind = pulse(0.01, 0.12, 0.3, p) * 0.8;
        pose.handY = -0.04 * gesture;
        pose.head = -0.08 * action;
        break;
      case "claude":
        pose.lean = -0.022 * gesture;
        pose.head = 0.07 * gesture - 0.1 * action;
        pose.handY = -0.02 * gesture;
        pose.handX = -0.01 * Math.sin(p * 25) * action;
        break;
      case "gemini":
        pose.handX = Math.sin(p * 28) * 0.022 * gesture;
        pose.handY = Math.cos(p * 28) * 0.012 * gesture - 0.02 * gesture;
        pose.head = Math.sin(p * 17) * 0.055 * action;
        pose.wind = 0.4 * action;
        break;
      case "deepseek":
        pose.handY = 0.025 * pulse(0.15, 0.28, 0.4, p);
        pose.y = -0.018 * Math.sin(p * 15) * action;
        pose.head = -0.06 * action;
        pose.wind = Math.sin(p * 18) * action;
        break;
      case "doubao":
        pose.handX = Math.sin(p * 42) * 0.022 * gesture;
        pose.handY = -0.035 * gesture;
        pose.head = Math.sin(p * 23) * 0.03 * gesture;
        pose.lean = Math.sin(p * 19) * 0.018 * action;
        break;
      case "qwen":
        pose.prop = Math.sin(p * 24) * 0.2 * gesture;
        pose.handX = Math.sin(p * 24) * 0.032 * gesture;
        pose.handY = -0.015 * gesture;
        pose.wind = Math.cos(p * 24) * 1.3 * gesture;
        pose.head = -0.04 * gesture;
        break;
      case "kimi":
        pose.handY = -0.06 * gesture;
        pose.y = -0.045 * action;
        pose.head = -0.08 * gesture;
        pose.wing = Math.sin(p * 15) * 8e-3 * action;
        break;
      case "grok":
        pose.prop = -0.12 * pulse(0.1, 0.27, 0.39, p) + 0.15 * pulse(0.27, 0.38, 0.53, p);
        pose.handX = -0.02 * pulse(0.1, 0.27, 0.39, p) + 0.03 * pulse(0.27, 0.38, 0.53, p);
        pose.lean = -0.045 * pulse(0.1, 0.27, 0.39, p) + 0.035 * pulse(0.27, 0.38, 0.55, p);
        pose.wind = 1.5 * pulse(0.35, 0.4, 0.6, p);
        break;
      case "seed":
        pose.handY = -0.028 * gesture;
        pose.handX = -0.035 * pulse(0.2, 0.35, 0.5, p);
        pose.lean = -0.025 * action;
        pose.head = 0.13 * pulse(0.43, 0.64, 0.85, p);
        break;
      case "copilot":
        pose.handX = -0.045 * pulse(0.18, 0.33, 0.46, p);
        pose.handY = -0.03 * gesture;
        pose.head = -0.08 * action;
        pose.wind = 0.7 * action;
        break;
      case "perplexity":
        pose.handX = Math.sin(p * 19) * 0.02 * gesture;
        pose.handY = -0.03 * gesture + Math.cos(p * 19) * 0.012 * gesture;
        pose.head = Math.sin(p * 15) * 0.06 * action;
        break;
      case "minimax":
        pose.handX = Math.sin(p * 45) * 0.02 * gesture;
        pose.handY = (-0.035 + Math.cos(p * 45) * 0.024) * gesture;
        pose.prop = Math.sin(p * 45) * 0.15 * gesture;
        pose.head = Math.sin(p * 45) * 0.025 * gesture;
        pose.wind = Math.sin(p * 45) * 0.35 * gesture;
        break;
    }
    for (const key of Object.keys(pose)) pose[key] *= amplitude;
    return pose;
  }
  function createActorRig(theme, texture, fit = "cover", poseProvider = poseAt) {
    const layer = document.createElement("canvas"), gl = layer.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw Error("\u89D2\u8272\u8054\u52A8\u9700\u8981 WebGL");
    const model = theme.id.replace(/-(art|anime)$/, ""), anime = theme.id.endsWith("-anime"), eyes = theme.eyes, face = [(eyes[0] + eyes[2]) * 0.5, (eyes[1] + eyes[3]) * 0.5];
    const hand = hands[model][anime ? 0 : 1], neck = [face[0], face[1] + (anime ? 0.09 : 0.18)], hip = [face[0], anime ? 0.68 : 0.9];
    const gaussian = (u, v, x, y, rx, ry) => Math.exp(-(((u - x) / rx) ** 2 + ((v - y) / ry) ** 2) * 2);
    function weights(u, v) {
      const propWeight = !anime ? 0 : model === "grok" ? gaussian(u, v, 0.55, 0.45, 0.22, 0.9) : model === "qwen" ? gaussian(u, v, 0.61, 0.26, 0.1, 0.12) : 0;
      return [gaussian(u, v, face[0], face[1], anime ? 0.1 : 0.18, anime ? 0.14 : 0.27), gaussian(u, v, hand[0], hand[1], anime ? 0.12 : 0.16, anime ? 0.14 : 0.22), gaussian(u, v, face[0] - 0.12, 0.47, 0.14, 0.2), gaussian(u, v, face[0] + 0.15, 0.48, 0.14, 0.2), propWeight];
    }
    function deform(u, v, pose, w = weights(u, v)) {
      let x = u, y = v;
      const head = pose.head * w[0], hx = x - neck[0], hy = y - neck[1];
      x = neck[0] + hx * Math.cos(head) - hy * Math.sin(head);
      y = neck[1] + hx * Math.sin(head) + hy * Math.cos(head);
      x += pose.handX * w[1];
      y += pose.handY * w[1];
      const prop = pose.prop * w[4], px = x - hand[0], py = y - hand[1];
      x = hand[0] + px * Math.cos(prop) - py * Math.sin(prop);
      y = hand[1] + px * Math.sin(prop) + py * Math.cos(prop);
      if (model === "chatgpt" && anime) {
        y += pose.wing * (w[2] - w[3] * 0.7);
        x += pose.wing * (w[2] * -0.3 + w[3] * 0.3);
      }
      const hair = (1 - w[0]) * (w[2] + w[3]);
      x += pose.wind * 7e-3 * hair;
      const a = pose.lean, dx = x - hip[0], dy = y - hip[1];
      return [hip[0] + dx * Math.cos(a) - dy * Math.sin(a) + pose.x, hip[1] + dx * Math.sin(a) + dy * Math.cos(a) + pose.y];
    }
    const program = gl.createProgram(), shaders = [];
    for (const [type, code] of [[gl.VERTEX_SHADER, "attribute vec2 position,uv;varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position,0.,1.);}"], [gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 tex;uniform sampler2D picture;void main(){vec4 c=texture2D(picture,tex);gl_FragColor=vec4(c.rgb*c.a,c.a);}"]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) || "\u89D2\u8272\u7740\u8272\u5668\u9519\u8BEF");
      gl.attachShader(program, shader);
      shaders.push(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("\u89D2\u8272\u7F51\u683C\u521D\u59CB\u5316\u5931\u8D25");
    gl.useProgram(program);
    const columns = 64, rows = 48, rest = [], skin = [], uv = [], indices = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const u = x / columns, v = y / rows;
      rest.push([u, v]);
      skin.push(weights(u, v));
      uv.push(u, v);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
    const positions = new Float32Array(rest.length * 2), positionBuffer = gl.createBuffer(), uvBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer(), image = gl.createTexture();
    const positionLocation = gl.getAttribLocation(program, "position"), uvLocation = gl.getAttribLocation(program, "uv");
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
    let width = 1280, height = 720;
    const project = ([u, v]) => {
      const scale = (fit === "contain" ? Math.min : Math.max)(width / texture.width, height / texture.height);
      return [(width - texture.width * scale) / 2 + u * texture.width * scale, (height - texture.height * scale) / 2 + v * texture.height * scale];
    };
    return {
      layer,
      hand,
      model,
      anime,
      draw(p, w, h) {
        width = w;
        height = h;
        if (layer.width !== w || layer.height !== h) {
          layer.width = w;
          layer.height = h;
        }
        const pose = poseProvider(model, p, anime);
        rest.forEach(([u, v], i) => {
          const [x, y] = project(deform(u, v, pose, skin[i]));
          positions[i * 2] = x / w * 2 - 1;
          positions[i * 2 + 1] = 1 - y / h * 2;
        });
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        gl.flush();
        return pose;
      },
      point(point, p) {
        return project(deform(point[0], point[1], poseProvider(model, p, anime)));
      },
      dispose() {
        gl.deleteTexture(image);
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(uvBuffer);
        gl.deleteBuffer(indexBuffer);
        shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        layer.width = layer.height = 0;
      }
    };
  }

  // src/warm-motion.ts
  var warmStories = {
    chatgpt: "\u70B9\u5934\u5F15\u5149",
    claude: "\u4E66\u9875\u8F7B\u626C",
    gemini: "\u53CC\u661F\u8F7B\u62E8",
    deepseek: "\u6307\u5C16\u6D9F\u6F2A",
    doubao: "\u6325\u624B\u8FCE\u6CE1",
    qwen: "\u8F7B\u6247\u9001\u98CE",
    kimi: "\u6258\u6708\u5F52\u73AF",
    grok: "\u63D0\u65A7\u81F4\u610F",
    seed: "\u8F7B\u89E6\u840C\u82BD",
    copilot: "\u7EB8\u7FFC\u56DE\u65CB",
    perplexity: "\u661F\u70B9\u786E\u8BA4",
    minimax: "\u8F7B\u62CD\u4F59\u97F3",
    aurora: "\u6781\u5149\u5E94\u661F",
    ocean: "\u6708\u5F71\u56DE\u6CE2",
    sakura: "\u98CE\u8FC7\u82B1\u679D",
    city: "\u706F\u706B\u63A5\u529B",
    orbit: "\u536B\u661F\u5F52\u8F68",
    ink: "\u98DE\u9E1F\u5F52\u5C71",
    forest: "\u8424\u706B\u76F8\u8FCE",
    crystal: "\u6298\u5149\u5171\u9E23"
  };
  function warmPose(model, p, anime) {
    const a = pulse(0, 0.3, 0.88, p), b = pulse(0.18, 0.48, 0.94, p), pose = { x: 0, y: 0, lean: 0, head: 0, handX: 0, handY: 0, prop: 0, wing: 0, wind: 0 };
    switch (model) {
      case "chatgpt":
        pose.head = 0.045 * a;
        pose.handY = -0.012 * b;
        pose.wing = 8e-3 * a;
        break;
      case "claude":
        pose.head = 0.035 * a;
        pose.handY = -0.014 * a;
        pose.wind = 0.25 * b;
        break;
      case "gemini":
        pose.handX = Math.sin(p * 7) * 0.014 * a;
        pose.head = -0.025 * b;
        break;
      case "deepseek":
        pose.handY = 0.016 * a;
        pose.head = 0.03 * b;
        pose.wind = 0.2 * b;
        break;
      case "doubao":
        pose.handX = Math.sin(p * 16) * 0.012 * a;
        pose.handY = -0.018 * a;
        pose.head = -0.03 * b;
        break;
      case "qwen":
        pose.prop = 0.1 * Math.sin(p * 8) * a;
        pose.handX = -0.018 * a;
        pose.wind = 0.65 * b;
        break;
      case "kimi":
        pose.handY = -0.024 * a;
        pose.head = -0.035 * b;
        break;
      case "grok":
        pose.prop = -0.055 * a;
        pose.handY = -9e-3 * a;
        pose.head = 0.035 * b;
        break;
      case "seed":
        pose.handY = 0.01 * a;
        pose.head = 0.055 * b;
        break;
      case "copilot":
        pose.handX = -0.018 * a;
        pose.head = -0.03 * b;
        pose.wind = 0.2 * b;
        break;
      case "perplexity":
        pose.handX = -8e-3 * a;
        pose.head = 0.025 * b;
        break;
      case "minimax":
        pose.handY = -0.016 * Math.sin(p * 10) * a;
        pose.head = 0.02 * Math.sin(p * 10) * a;
        break;
    }
    if (!anime) for (const key of Object.keys(pose)) pose[key] *= 0.55;
    return pose;
  }
  async function load(url) {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }
  async function createWarmScene(canvas, source, spec) {
    const model = spec.theme.id.replace(/-(art|anime)$/, ""), ctx = canvas.getContext("2d"), color = spec.theme.colors[1];
    const layers = spec.theme.image && spec.actorURL && spec.stageURL ? await Promise.all([load(spec.actorURL), load(spec.stageURL)]) : null;
    const rig = layers ? createActorRig(spec.theme, layers[0], spec.fit, warmPose) : null;
    const line = (points, alpha = 1, width = 2, tint = color) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = tint;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.stroke();
      ctx.restore();
    };
    const dot = ([x, y], r, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const ring = ([x, y], r, alpha = 1, aspect = 0.4) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.01, r), Math.max(0.01, r * aspect), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    canvas.dataset.sequence = "warm-" + model;
    return {
      draw(seconds) {
        const p = Math.max(0, Math.min(1, seconds * 1e3 / spec.durationMs)), w = canvas.width, h = canvas.height, W = 1280, H = W * h / w;
        ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(source, 0, 0, W, H);
        canvas.dataset.phase = p >= 1 ? "rest" : p < 0.3 ? "greeting" : p < 0.7 ? "interaction" : "settle";
        if (p <= 0 || p >= 1) return;
        const strength = ease(0, 0.16, p) * (1 - ease(0.64, 1, p)), gesture = pulse(0, 0.35, 0.96, p);
        let hand = [W * 0.67, H * 0.44];
        if (rig && layers) {
          ctx.save();
          ctx.globalAlpha = strength;
          const stage = layers[1], scale = (spec.fit === "contain" ? Math.min : Math.max)(W / stage.width, H / stage.height);
          ctx.drawImage(stage, (W - stage.width * scale) / 2, (H - stage.height * scale) / 2, stage.width * scale, stage.height * scale);
          rig.draw(p, W, H);
          ctx.drawImage(rig.layer, 0, 0, W, H);
          ctx.restore();
          hand = rig.point(rig.hand, p);
        }
        ctx.save();
        ctx.globalAlpha = strength;
        const [x, y] = hand, t = ease(0.15, 0.82, p);
        switch (model) {
          case "chatgpt": {
            const orb = [x - 110 * t, y - 60 * Math.sin(t * Math.PI)];
            dot(orb, 4 + gesture * 2);
            ring(orb, 8 + gesture * 12, 0.4, 1);
            for (let i = 0; i < 7; i++) dot([orb[0] + Math.cos(i * 2.4) * 25, orb[1] + Math.sin(i * 2.4) * 18], 1.2);
            break;
          }
          case "claude":
            for (let i = 0; i < 3; i++) {
              const k = pulse(0.06 + i * 0.05, 0.3 + i * 0.04, 0.9, p);
              ctx.save();
              ctx.translate(x - 18 - i * 19 * k, y - 35 * k - i * 12);
              ctx.rotate(-0.2 - k * 0.6);
              ctx.fillStyle = "#fff4da";
              ctx.strokeStyle = "#ba8b55";
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.quadraticCurveTo(8, -12 * k, 22, -5 * k);
              ctx.lineTo(22, 19);
              ctx.quadraticCurveTo(7, 15, 0, 21);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }
            break;
          case "gemini":
            for (const side of [-1, 1]) {
              const angle = p * 6 + side * Math.PI;
              const point = [x + Math.cos(angle) * 32 * gesture, y - 25 + Math.sin(angle) * 16 * gesture];
              dot(point, 4);
              line([hand, point], 0.35);
            }
            break;
          case "deepseek":
            for (let i = 0; i < 3; i++) ring([x, y + 18], 8 + 55 * ease(0.12 + i * 0.06, 0.8, p), pulse(0.1 + i * 0.06, 0.4, 0.94, p));
            break;
          case "doubao":
            for (let i = 0; i < 3; i++) {
              const q = pulse(0.04 + i * 0.04, 0.4, 0.95, p);
              ring([x - 15 - i * 25 * q, y - 20 - i * 18 * q], 6 + i * 2, 0.8, 1);
              dot([x - 18 - i * 25 * q, y - 23 - i * 18 * q], 1.2);
            }
            break;
          case "qwen":
            for (let i = 0; i < 7; i++) {
              const k = (i + 1) / 7;
              const pos = [x - 150 * t * k, y + Math.sin(k * 6 + p * 5) * 18 * gesture];
              ctx.save();
              ctx.translate(...pos);
              ctx.rotate(p * 5 + i);
              ctx.fillStyle = "#8bb99d";
              ctx.beginPath();
              ctx.ellipse(0, 0, 6, 2.5, 0, 0, 7);
              ctx.fill();
              ctx.restore();
            }
            break;
          case "kimi": {
            const moon = [x - 20 * gesture, y - 45 * gesture];
            ring(moon, 15, 0.85, 1);
            ring(moon, 30 * gesture, 0.5, 0.4);
            dot([moon[0] + Math.cos(p * 7) * 30 * gesture, moon[1] + Math.sin(p * 7) * 12 * gesture], 2.5);
            break;
          }
          case "grok": {
            const tip = rig?.point(rig.anime ? [0.55, 0.17] : rig.hand, p) || hand;
            line([[tip[0] - 12, tip[1]], [tip[0] + 12, tip[1]]], gesture, 2, "#ffe4a7");
            line([[tip[0], tip[1] - 18], [tip[0], tip[1] + 18]], gesture, 2, "#ffe4a7");
            ring(tip, 24 * gesture, 0.4, 1);
            break;
          }
          case "seed": {
            const stem = [x - 20, y + 10];
            line([stem, [stem[0], stem[1] - 24 * gesture]], 1, 2, "#91bc73");
            for (const side of [-1, 1]) {
              ctx.save();
              ctx.translate(stem[0] + side * 7 * gesture, stem[1] - 18 * gesture);
              ctx.rotate(side * 0.7);
              ctx.fillStyle = "#b6d785";
              ctx.beginPath();
              ctx.ellipse(0, 0, 5 * gesture, 11 * gesture, 0, 0, 7);
              ctx.fill();
              ctx.restore();
            }
            break;
          }
          case "copilot": {
            const point = [x - 105 * Math.sin(t * Math.PI), y - 40 * Math.sin(t * Math.PI * 2)];
            ctx.save();
            ctx.translate(...point);
            ctx.rotate(-0.5 + t * 2);
            ctx.fillStyle = "#eefaff";
            ctx.strokeStyle = "#91bdd6";
            ctx.beginPath();
            ctx.moveTo(14, -4);
            ctx.lineTo(-12, -6);
            ctx.lineTo(-3, 4);
            ctx.lineTo(-2, 11);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            break;
          }
          case "perplexity": {
            const stars = [[x - 90, y - 12], [x - 58, y - 39], [x - 24, y - 20]];
            stars.forEach((point, i) => {
              dot(point, 3, ease(i * 0.12, 0.3 + i * 0.12, p));
              if (i) line([stars[i - 1], point], ease(0.18, 0.6, p));
            });
            dot([x - 24 * (1 - t), y - 20 * (1 - t)], 3);
            break;
          }
          case "minimax":
            for (let i = 0; i < 3; i++) {
              const k = pulse(0.08 + i * 0.1, 0.3 + i * 0.1, 0.94, p);
              ctx.fillStyle = color;
              ctx.font = "22px serif";
              ctx.fillText(i % 2 ? "\u266B" : "\u266A", x - 30 - i * 30 * k, y - 40 * k);
              ring([x - 30 - i * 30, y + 24], 25 * k, k);
            }
            break;
          case "aurora":
            for (let i = 0; i < 3; i++) line(Array.from({ length: 40 }, (_, j) => [j / 39 * W, H * 0.3 + Math.sin(j * 0.14 + p * 2 + i) * 30 * gesture + i * 16]), gesture * 0.35, 4);
            break;
          case "ocean":
            for (let i = 0; i < 3; i++) ring([W * 0.67, H * 0.67], 20 + 130 * ease(i * 0.06, 0.9, p), gesture * 0.7);
            break;
          case "sakura":
            for (let i = 0; i < 10; i++) {
              ctx.save();
              ctx.translate(W * (0.55 + i * 0.035) - 80 * t, H * 0.3 + Math.sin(i + p * 5) * 30 * gesture);
              ctx.rotate(p * 4 + i);
              ctx.fillStyle = "#f0c0d5";
              ctx.beginPath();
              ctx.ellipse(0, 0, 5, 2, 0, 0, 7);
              ctx.fill();
              ctx.restore();
            }
            break;
          case "city":
            for (let i = 0; i < 9; i++) {
              const k = pulse(i * 0.035, 0.3 + i * 0.035, 0.98, p);
              line([[W * (0.2 + i * 0.06), H * 0.6], [W * (0.2 + i * 0.06), H * (0.6 - k * 0.16)]], k, 3);
            }
            break;
          case "orbit": {
            const a = p * Math.PI * 2;
            ring([W * 0.62, H * 0.48], 90, 0.5, 0.4);
            dot([W * 0.62 + Math.cos(a) * 90, H * 0.48 + Math.sin(a) * 36], 4);
            break;
          }
          case "ink":
            for (let i = 0; i < 4; i++) {
              const a = W * (0.35 + i * 0.035) + 90 * t, b = H * 0.3 + Math.sin(p * 9 + i) * 4;
              line([[a - 8, b - 5], [a, b], [a + 8, b - 5]], 0.75, 1.5, "#506c66");
            }
            break;
          case "forest":
            for (let i = 0; i < 12; i++) dot([W * (0.25 + i * 0.045) + Math.sin(p * 6 + i) * 15, H * 0.65 + Math.sin(i * 2 + p * 4) * 30], 2.2, pulse(i * 0.025, 0.3 + i * 0.025, 0.98, p));
            break;
          case "crystal": {
            const points = [[W * 0.28, H * 0.5], [W * 0.42, H * 0.35], [W * 0.56, H * 0.55], [W * 0.7, H * 0.38]];
            points.forEach((point, i) => {
              dot(point, 4);
              if (i) line([points[i - 1], point], gesture, 2);
            });
            break;
          }
        }
        ctx.restore();
        canvas.dataset.interaction = warmStories[model];
        canvas.dataset.hand = JSON.stringify(hand);
      },
      dispose() {
        rig?.dispose();
      }
    };
  }

  // src/cold-stories.ts
  var coldStories = {
    "chatgpt-art": { name: "\u7EC7\u5149\u56DE\u8DEF", beats: ["\u5149\u5E26\u5165\u573A", "\u4EA4\u7EC7\u6210\u7ED3", "\u56DE\u8DEF\u901A\u660E"], exit: 0.84 },
    "chatgpt-anime": { name: "\u661F\u4EEA\u542F\u5C01", beats: ["\u661F\u4EEA\u82CF\u9192", "\u4E09\u8F74\u6821\u51C6", "\u661F\u6838\u70B9\u4EAE"], exit: 0.88 },
    "claude-art": { name: "\u4E66\u9601\u7FFB\u7AE0", beats: ["\u4E66\u810A\u5C55\u5F00", "\u4E66\u9875\u7FFB\u52A8", "\u65B0\u7AE0\u843D\u5B9A"], exit: 0.82 },
    "claude-anime": { name: "\u957F\u7B3A\u6765\u4FE1", beats: ["\u4FE1\u7B3A\u5C55\u5F00", "\u5B57\u53E5\u843D\u7B14", "\u4E66\u4FE1\u7B7E\u7AE0"], exit: 0.86 },
    "gemini-art": { name: "\u6D41\u4F53\u53CC\u751F", beats: ["\u53CC\u5149\u9760\u8FD1", "\u80FD\u91CF\u4EA4\u6362", "\u5171\u632F\u7EFD\u653E"], exit: 0.83 },
    "gemini-anime": { name: "\u68F1\u955C\u5206\u5149", beats: ["\u5149\u675F\u5165\u5C04", "\u68F1\u955C\u6298\u5C04", "\u4E03\u8272\u5171\u9E23"], exit: 0.87 },
    "deepseek-art": { name: "\u6DF1\u6D77\u63A2\u8BAF", beats: ["\u58F0\u5450\u626B\u63CF", "\u56DE\u58F0\u5B9A\u4F4D", "\u5EFA\u7ACB\u8FDE\u63A5"], exit: 0.86 },
    "deepseek-anime": { name: "\u9CB8\u6E38\u661F\u6D77", beats: ["\u9CB8\u5F71\u6E38\u5165", "\u7A7F\u8D8A\u6C34\u73AF", "\u6F5C\u5165\u8FDC\u6D77"], exit: 0.82 },
    "doubao-art": { name: "\u5BF9\u8BDD\u63A5\u529B", beats: ["\u4E00\u53E5\u95EE\u5019", "\u6C14\u6CE1\u63A5\u7B54", "\u5FC3\u610F\u76F8\u8FDE"], exit: 0.82 },
    "doubao-anime": { name: "\u5F39\u8DF3\u594F\u9E23", beats: ["\u8F7B\u7403\u843D\u4E0B", "\u5F39\u7C27\u63A5\u529B", "\u4E00\u8D77\u843D\u5B9A"], exit: 0.85 },
    "qwen-art": { name: "\u5C71\u6C34\u5F00\u5377", beats: ["\u53CC\u8F74\u5C55\u5377", "\u8FDC\u5C71\u5165\u58A8", "\u6731\u5370\u843D\u6B3E"], exit: 0.88 },
    "qwen-anime": { name: "\u6298\u6247\u542C\u98CE", beats: ["\u6247\u9AA8\u94FA\u5F00", "\u7AF9\u5F71\u968F\u98CE", "\u6247\u9762\u843D\u5B9A"], exit: 0.83 },
    "kimi-art": { name: "\u6708\u76F8\u5DE1\u822A", beats: ["\u65B0\u6708\u521D\u5347", "\u6708\u76F8\u76C8\u8F6C", "\u536B\u661F\u5F52\u8F68"], exit: 0.86 },
    "kimi-anime": { name: "\u6708\u949F\u62A5\u65F6", beats: ["\u949F\u6446\u8D77\u884C", "\u6307\u9488\u5DE1\u884C", "\u6307\u9488\u5F52\u96F6"], exit: 0.89 },
    "grok-art": { name: "\u5F15\u529B\u822A\u9053", beats: ["\u661F\u5149\u504F\u8F6C", "\u76D8\u9762\u52A0\u901F", "\u5F15\u529B\u7A33\u5B9A"], exit: 0.84 },
    "grok-anime": { name: "\u9ED1\u91D1\u6620\u5B57", beats: ["\u91D1\u8272\u5B57\u7F18", "\u5B57\u8DDD\u5408\u62E2", "\u6620\u5149\u5B9A\u683C"], exit: 0.81 },
    "seed-art": { name: "\u7834\u571F\u6210\u6797", beats: ["\u79CD\u5B50\u843D\u571F", "\u6839\u830E\u751F\u957F", "\u679D\u53F6\u8212\u5C55"], exit: 0.89 },
    "seed-anime": { name: "\u6298\u53F6\u65B0\u751F", beats: ["\u7EB8\u9762\u7FFB\u6298", "\u53F6\u8109\u5BF9\u5408", "\u65B0\u53F6\u8FCE\u5149"], exit: 0.83 },
    "copilot-art": { name: "\u4E91\u7AEF\u822A\u7EBF", beats: ["\u822A\u9053\u70B9\u4EAE", "\u4E91\u95F4\u7A7F\u884C", "\u9A76\u5411\u8FDC\u65B9"], exit: 0.85 },
    "copilot-anime": { name: "\u7EB8\u7FFC\u542F\u822A", beats: ["\u7EB8\u7FFC\u6298\u6210", "\u4E58\u98CE\u8D77\u98DE", "\u7ED5\u884C\u5F52\u822A"], exit: 0.88 },
    "perplexity-art": { name: "\u6C42\u77E5\u661F\u56FE", beats: ["\u95EE\u9898\u70B9\u4EAE", "\u77E5\u8BC6\u4F20\u9012", "\u8DEF\u5F84\u76F8\u901A"], exit: 0.86 },
    "perplexity-anime": { name: "\u5BFB\u661F\u8C03\u7126", beats: ["\u661F\u70B9\u5931\u7126", "\u955C\u7247\u5BF9\u9F50", "\u76EE\u6807\u786E\u8BA4"], exit: 0.82 },
    "minimax-art": { name: "\u5531\u7247\u542F\u594F", beats: ["\u5531\u9488\u843D\u4E0B", "\u5531\u7247\u65CB\u8F6C", "\u4F59\u97F3\u73AF\u7ED5"], exit: 0.85 },
    "minimax-anime": { name: "\u62E8\u5F26\u56DE\u54CD", beats: ["\u7434\u5F26\u5F20\u5F00", "\u6307\u5149\u62E8\u5F26", "\u5171\u9E23\u56DE\u843D"], exit: 0.88 },
    aurora: { name: "\u6781\u5149\u5929\u5E55", beats: ["\u5FAE\u5149\u8D77\u4F0F", "\u5149\u5E55\u5782\u843D", "\u6781\u591C\u6D41\u8F6C"], exit: 0.88 },
    sakura: { name: "\u4E00\u679D\u6625\u4FE1", beats: ["\u82B1\u82DE\u521D\u9192", "\u679D\u5934\u6B21\u7B2C\u5F00", "\u82B1\u74E3\u4E58\u98CE"], exit: 0.85 },
    city: { name: "\u57CE\u5E02\u901A\u7535", beats: ["\u7535\u6D41\u5165\u57CE", "\u697C\u5B87\u70B9\u4EAE", "\u8857\u533A\u8FDE\u901A"], exit: 0.82 },
    ocean: { name: "\u4E00\u6EF4\u6210\u6F6E", beats: ["\u6C34\u6EF4\u5760\u843D", "\u6C34\u51A0\u8DC3\u8D77", "\u6D9F\u6F2A\u63A8\u8FDC"], exit: 0.87 },
    orbit: { name: "\u661F\u73AF\u4F1A\u5408", beats: ["\u8F68\u9053\u8FDB\u8FD1", "\u536B\u661F\u4EA4\u4F1A", "\u661F\u73AF\u6210\u5217"], exit: 0.84 },
    ink: { name: "\u843D\u7B14\u6210\u5C71", beats: ["\u4E3B\u5CF0\u8D77\u7B14", "\u8FDC\u5C71\u53E0\u58A8", "\u98DE\u9E1F\u70B9\u775B"], exit: 0.89 },
    forest: { name: "\u8424\u8DEF\u5F15\u822A", beats: ["\u8424\u5149\u5F15\u8DEF", "\u6797\u95F4\u547C\u5E94", "\u70B9\u4EAE\u5F52\u9014"], exit: 0.86 },
    crystal: { name: "\u6676\u683C\u6298\u5149", beats: ["\u6676\u6838\u8F6C\u52A8", "\u68F1\u9762\u76F8\u8FDE", "\u5149\u8DEF\u8D2F\u901A"], exit: 0.83 }
  };

  // src/cold-cinematics.ts
  var tau = Math.PI * 2;
  var clamp2 = (x) => Math.max(0, Math.min(1, x));
  var ease2 = (a, b, x) => {
    const p = clamp2((x - a) / (b - a));
    return p * p * (3 - 2 * p);
  };
  var mix = (a, b, p) => a + (b - a) * p;
  function createColdCinematic(canvas, background, spec) {
    const ctx = canvas.getContext("2d"), story = coldStories[spec.theme.id];
    if (!story) throw Error("\u7F3A\u5C11\u4E3B\u9898\u51B7\u542F\u52A8\u5206\u955C\uFF1A" + spec.theme.id);
    const [, light, accent] = spec.theme.colors;
    let time = 0, p = 0;
    const path = (points, color = light, width = 2, alpha = 1, close = false, fill) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.globalAlpha *= clamp2(alpha);
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (close) ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    };
    const curve = (fn, color = light, width = 2, alpha = 1, start = 0, end = 1) => {
      const points = [];
      for (let i = 0; i <= 100; i++) points.push(fn(mix(start, end, i / 100)));
      path(points, color, width, alpha);
    };
    const orb = (x, y, r, color = light, alpha = 1) => {
      if (r <= 0) return;
      ctx.save();
      ctx.globalAlpha *= clamp2(alpha);
      const glow = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r);
      glow.addColorStop(0, "#fff8ee");
      glow.addColorStop(0.25, color);
      glow.addColorStop(1, color + "00");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, tau);
      ctx.fill();
      ctx.restore();
    };
    const ring = (x, y, rx, ry = rx, angle = 0, alpha = 1, color = light, width = 1.6) => curve((t) => [x + Math.cos(t * tau + angle) * rx, y + Math.sin(t * tau + angle) * ry], color, width, alpha);
    const text = (value, x, y, size = 16, color = accent, alpha = 1, align = "center") => {
      ctx.save();
      ctx.globalAlpha *= clamp2(alpha);
      ctx.fillStyle = color;
      ctx.font = `500 ${size}px "Microsoft YaHei UI",sans-serif`;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
      ctx.restore();
    };
    const strokeText = (value, x, y, size, color = light) => {
      ctx.save();
      ctx.font = `700 ${size}px "Segoe UI",sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = color;
      ctx.strokeText(value, x, y);
      ctx.restore();
    };
    const transform = (x, y, angle, draw2) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      draw2();
      ctx.restore();
    };
    const progress = (a = 0, b = 0.8) => ease2(a, b, p);
    const project = (x, y, z, ry = 0, rx = 0) => {
      const a = x * Math.cos(ry) + z * Math.sin(ry), b = z * Math.cos(ry) - x * Math.sin(ry), c = y * Math.cos(rx) - b * Math.sin(rx), depth = y * Math.sin(rx) + b * Math.cos(rx), s = 700 / (700 + depth);
      return [340 + a * s, 325 + c * s];
    };
    const leaf = (x, y, size, angle, color = light) => transform(x, y, angle, () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(size * 0.1, -size * 0.65, size, 0);
      ctx.quadraticCurveTo(size * 0.1, size * 0.65, 0, 0);
      ctx.fillStyle = color;
      ctx.globalAlpha *= 0.7;
      ctx.fill();
      path([[0, 0], [size, 0]], accent, 1, 0.6);
    });
    const stamp = (label, x = 490, y = 438) => {
      const v = progress(0.58, 0.7);
      ctx.save();
      ctx.globalAlpha *= v;
      ctx.translate(x, y);
      ctx.rotate(-0.09);
      ctx.strokeStyle = "#d96755";
      ctx.lineWidth = 2;
      ctx.strokeRect(-23, -23, 46, 46);
      text(label, 0, 7, 20, "#ec8c79");
      ctx.restore();
    };
    const scenes = {
      "chatgpt-art": () => {
        const travel = progress(0.02, 0.66), rotation = 1.1 * (1 - travel) + time * 0.06;
        for (let k = 0; k < 6; k++) {
          const a = k * tau / 6;
          curve((t) => {
            const u2 = t * tau, rad2 = 116 + 32 * Math.cos(3 * u2 + a);
            return project(Math.cos(u2 + a) * rad2, Math.sin(u2 + a) * rad2, 48 * Math.sin(3 * u2 + a), rotation, 0.45);
          }, k % 2 ? accent : light, 5, 0.35 + 0.6 * travel, 0, Math.max(0.015, ease2(k * 0.035, 0.5 + k * 0.035, p)));
          const u = (time * 0.17 + k / 6) % 1 * tau, rad = 116 + 32 * Math.cos(3 * u + a), q = project(Math.cos(u + a) * rad, Math.sin(u + a) * rad, 48 * Math.sin(3 * u + a), rotation, 0.45);
          orb(...q, 9);
        }
        orb(340, 325, 45, light, progress(0.42, 0.7));
        text("\u8FDE\u63A5 \xB7 \u63A8\u6F14 \xB7 \u521B\u9020", 340, 520, 17, accent, progress(0.55, 0.7));
      },
      "chatgpt-anime": () => {
        for (let k = 0; k < 3; k++) {
          const turn = (1 - progress(0.08 + k * 0.06, 0.58 + k * 0.05)) * (k + 1) * 2.1;
          curve((t) => project(Math.cos(t * tau) * 145, Math.sin(t * tau) * 145, 0, turn + k * 1.05, 0.5 + k * 0.45), k % 2 ? accent : light, 2.6, 0.85);
          for (let i = 0; i < 24; i++) {
            const a = i * tau / 24;
            const q = project(Math.cos(a) * 145, Math.sin(a) * 145, 0, turn + k * 1.05, 0.5 + k * 0.45);
            orb(...q, 2.5, accent, 0.7);
          }
        }
        orb(340, 325, 15 + 28 * progress(0.45, 0.68));
        ring(340, 325, 185, 185, 0, 0.2);
        text("\u661F\u4EEA \xB7 \u6821\u51C6\u5B8C\u6210", 340, 530, 17, accent, progress(0.65, 0.75));
      },
      "claude-art": () => {
        const open = progress(0.02, 0.23), w = 190 * open + 8;
        path([[340 - w, 234], [340, 250], [340 + w, 234], [340 + w, 449], [340, 465], [340 - w, 449]], "#b68153", 3, 1, true, "#36261f");
        for (let side = -1; side <= 1; side += 2) {
          const paper = ctx.createLinearGradient(340, 0, 340 + side * w, 0);
          paper.addColorStop(0, "#a88a61");
          paper.addColorStop(0.15, "#d9be92");
          paper.addColorStop(1, "#f3e3c5");
          path([[340, 257], [340 + side * w * 0.95, 243], [340 + side * w * 0.95, 435], [340, 454]], "#eacb9c", 1, 1, true, paper);
        }
        for (let row = 0; row < 9; row++) {
          path([[365, 275 + row * 16], [490 - row % 3 * 15, 266 + row * 16]], "#795e43", 1.3, 0.65 * open);
          path([[190, 265 + row * 16], [315, 275 + row * 16]], "#795e43", 1.3, 0.65 * open);
        }
        for (let i = 2; i >= 0; i--) {
          const turn = progress(0.24 + i * 0.095, 0.43 + i * 0.095), a = turn * Math.PI, x = 340 + Math.cos(a) * w * 0.93, lift = Math.sin(a) * 64;
          if (turn > 0 && turn < 1) {
            const paper = ctx.createLinearGradient(340, 0, x || 341, 0);
            paper.addColorStop(0, "#9f805a");
            paper.addColorStop(0.24, turn < 0.5 ? "#e8cca3" : "#c7a778");
            paper.addColorStop(1, "#fff0d3");
            path([[340, 254], [x, 240 - lift], [x, 436 - lift], [340, 453]], "#ad926a", 1, 1, true, paper);
          }
        }
        text("CHAPTER 01", 245, 325, 15, "#6a4934", progress(0.55, 0.64));
        text("\u65B0\u7684\u7BC7\u7AE0", 245, 360, 20, "#6a4934", progress(0.58, 0.68));
        orb(340, 451, 22, light, 0.5 * progress(0.65, 0.72));
      },
      "claude-anime": () => {
        const h = 210 * progress(0.04, 0.3) + 12;
        ctx.fillStyle = "#f1dec4";
        ctx.fillRect(212, 300 - h / 2, 260, h);
        for (const y of [300 - h / 2, 300 + h / 2]) {
          path([[202, y], [482, y]], "#af855e", 12);
          path([[209, y - 3], [474, y - 3]], "#f8e4bf", 3);
        }
        const lines = ["\u81F4\u6BCF\u4E00\u6B21\u597D\u5947\uFF0C", "\u8BA9\u95EE\u9898\u6210\u4E3A\u8D77\u70B9\uFF0C", "\u8BA9\u60F3\u8C61\u6162\u6162\u751F\u957F\u3002"];
        lines.forEach((v, i) => text(v.slice(0, Math.ceil(v.length * progress(0.28 + i * 0.11, 0.45 + i * 0.11))), 240, 260 + i * 43, 20, "#684c3b", 1, "left"));
        const pen = progress(0.28, 0.68);
        path([[210 + pen * 260, 410], [230 + pen * 260, 375]], light, 3, 1 - progress(0.68, 0.75));
        stamp("\u542F", 440, 465);
      },
      "gemini-art": () => {
        const a = progress(0.06, 0.6), distance = 130 * (1 - a) + 42;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let k = 0; k < 2; k++) {
          const x = 340 + (k ? 1 : -1) * distance, y = 325 + Math.sin(time * 1.4 + k * Math.PI) * 30 * (1 - a);
          const color = k ? "#ef9ae7" : "#78baff";
          orb(x, y, 100, color, 0.75);
          for (let j = 0; j < 5; j++) curve((t) => {
            const u = t * tau, r2 = 70 + j * 8 + 8 * Math.sin(u * 4 + time * 1.4 + k);
            return [x + Math.cos(u) * r2, y + Math.sin(u) * r2];
          }, color, 1.2, 0.25);
        }
        ctx.restore();
        const r = 92 * progress(0.42, 0.7);
        curve((t) => {
          const a2 = t * tau, s = Math.pow(Math.abs(Math.sin(2 * a2)), 0.65);
          return [340 + Math.cos(a2) * (18 + r * s), 325 + Math.sin(a2) * (18 + r * s)];
        }, accent, 2, progress(0.4, 0.6));
        text("\u7075\u611F\uFF0C\u5728\u4EA4\u6C47\u5904\u53D1\u751F", 340, 520, 17, accent, progress(0.6, 0.73));
      },
      "gemini-anime": () => {
        const a = -0.15 + 0.3 * progress(0.06, 0.55);
        transform(340, 330, a, () => {
          path([[-62, 90], [0, -105], [70, 90]], light, 2, 1, true, "#819bd51c");
          path([[-62, 90], [0, 20], [70, 90], [0, -105], [0, 20]], accent, 1, 0.6);
        });
        path([[95, 325], [mix(95, 330, progress(0.02, 0.27)), 325]], "#fff5dc", 5, 0.9);
        const colors = ["#ef99ae", "#ffc192", "#f0de9c", "#b9e5b2", "#85cdeb", "#9fa8ef", "#d9b0ed"];
        colors.forEach((color, i) => {
          const q = progress(0.25 + i * 0.018, 0.58 + i * 0.02);
          path([[345, 328], [345 + q * 225, 328 + (i - 3) * q * 37]], color, 3, 0.85);
          orb(345 + q * 225, 328 + (i - 3) * q * 37, 7, color, q);
        });
        ring(340, 330, 180, 180, 0, 0.15);
        text("\u4E00\u9053\u5149\uFF0C\u4E03\u79CD\u53EF\u80FD", 340, 545, 18, accent, progress(0.65, 0.75));
      },
      "deepseek-art": () => {
        const turn = time * 0.67;
        for (let r = 45; r <= 180; r += 45) ring(340, 325, r, r, 0, 0.28);
        path([[150, 325], [530, 325]], light, 1, 0.18);
        path([[340, 135], [340, 515]], light, 1, 0.18);
        for (let i = 0; i < 28; i++) path([[340, 325], [340 + Math.cos(turn - i * 0.018) * 180, 325 + Math.sin(turn - i * 0.018) * 180]], light, 2, (1 - i / 28) * 0.13);
        const targets = [[240, 245], [440, 390], [390, 225]];
        targets.forEach(([x, y], i) => {
          const hit = progress(0.17 + i * 0.13, 0.23 + i * 0.13);
          orb(x, y, 8, accent, hit);
          ring(x, y, 12 + 16 * ((time * 0.5 + i * 0.31) % 1), 12 + 16 * ((time * 0.5 + i * 0.31) % 1), 0, hit * 0.5);
          if (i) path([targets[i - 1], [x, y]], light, 1, progress(0.55, 0.7));
        });
        text("\u53D1\u73B0\u56DE\u58F0 \xB7 \u8FDE\u63A5\u6DF1\u5904", 340, 550, 17, accent, progress(0.58, 0.72));
      },
      "deepseek-anime": () => {
        const q = progress(0.02, 0.8), x = mix(130, 565, q), y = 335 - 70 * Math.sin(q * Math.PI);
        for (let i = 0; i < 3; i++) ring(250 + i * 115, 325, 28 + 12 * i, 90 + i * 12, 0, 0.3, light);
        transform(x, y, Math.sin(q * tau) * 0.14, () => {
          const whale = [];
          for (let i = 0; i <= 70; i++) {
            const a = i * tau / 70;
            whale.push([Math.cos(a) * 86, Math.sin(a) * (a < Math.PI ? 31 : 39)]);
          }
          path(whale, light, 1, 1, true, "#5b99bc");
          path([[-72, 0], [-112, -40], [-101, 0], [-118, 30], [-72, 12]], light, 1, 1, true, "#76b7d6");
          path([[-2, 20], [-28, 61], [31, 29]], light, 1, 1, true, "#92cada");
          orb(51, -11, 3, accent);
        });
        for (let i = 0; i < 14; i++) {
          const u = clamp2(q - i * 0.025);
          orb(mix(130, 565, u) - 65, 335 - 70 * Math.sin(u * Math.PI) + Math.sin(i) * 15, 2, light, 0.4 * (1 - i / 14));
        }
        text("\u5FAA\u7740\u56DE\u54CD\uFF0C\u6E38\u5411\u8FDC\u65B9", 340, 530, 18, accent, progress(0.58, 0.72));
      },
      "doubao-art": () => {
        const bubbles = [{ x: 170, y: 230, w: 240, t: "\u4F60\u597D\uFF0C\u4ECA\u5929\u60F3\u804A\u4EC0\u4E48\uFF1F", a: 0.02 }, { x: 285, y: 330, w: 220, t: "\u4E00\u4E2A\u5C0F\u5C0F\u7684\u7075\u611F\u3002", a: 0.23 }, { x: 185, y: 430, w: 255, t: "\u597D\u5440\uFF0C\u6211\u4EEC\u4E00\u8D77\u8BD5\u8BD5\u3002", a: 0.46 }];
        bubbles.forEach((b, i) => {
          const q = progress(b.a, b.a + 0.17), offset = 24 * (1 - q);
          ctx.save();
          ctx.globalAlpha *= q;
          ctx.fillStyle = i % 2 ? "#f2d4c2" : "#3f4553";
          ctx.beginPath();
          ctx.roundRect(b.x, b.y + offset, b.w, 62, 20);
          ctx.fill();
          text(b.t, b.x + 18, b.y + 38 + offset, 17, i % 2 ? "#594332" : "#f5ded0", 1, "left");
          ctx.restore();
          if (i) path([[b.x + 40, b.y - 32], [b.x + 40, b.y - 7]], light, 2, q * 0.6);
        });
      },
      "doubao-anime": () => {
        for (let i = 0; i < 5; i++) {
          const q = clamp2((p - 0.06 - i * 0.075) / 0.19), bounce = q === 0 ? 150 : Math.abs(Math.cos(q * Math.PI * 2.5)) * 100 * Math.pow(1 - q, 2), x = 175 + i * 82, y = 392 - bounce;
          curve((t) => [x - 22 + 44 * t, 430 + Math.sin(t * Math.PI * 10) * (8 + Math.max(0, 35 - bounce) * 0.2)], light, 1.5, 0.7);
          orb(x, y, 26, i % 2 ? accent : light, progress(i * 0.04, 0.1 + i * 0.04));
          path([[x - 26, 412], [x + 26, 412]], accent, 3, 0.6);
        }
        text("\u4E00\u70B9\u5FEB\u4E50\uFF0C\u4F20\u7ED9\u4E0B\u4E00\u4F4D", 340, 530, 20, accent, progress(0.57, 0.72));
      },
      "qwen-art": () => {
        const spread = progress(0.02, 0.3), left = 340 - 205 * spread, right = 340 + 205 * spread;
        ctx.fillStyle = "#e5dbc3";
        ctx.fillRect(left, 210, right - left, 250);
        for (const x of [left, right]) {
          path([[x, 195], [x, 475]], "#8e7661", 15);
          path([[x - 3, 202], [x - 3, 469]], "#d8c9ae", 4);
        }
        for (let k = 0; k < 3; k++) curve((t) => [left + 25 + t * Math.max(0, right - left - 50), 395 - k * 22 - 40 * Math.sin(t * 8 + k) - 30 * Math.sin(t * 17 + k)], "#687c73", 2 + k * 2, 0.5 * spread, 0, progress(0.3 + k * 0.065, 0.51 + k * 0.065));
        text("\u5C71 \u6D77 \u6709 \u95EE", 340, 272, 26, "#53665e", progress(0.45, 0.62));
        stamp("\u7B54", 490, 420);
      },
      "qwen-anime": () => {
        const spread = progress(0.03, 0.44) * 2.3 + 0.04;
        for (let k = 0; k < 18; k++) {
          const a = -Math.PI / 2 - spread / 2 + k * spread / 17, b = a + spread / 17;
          path([[340, 465], [340 + Math.cos(a) * 240, 465 + Math.sin(a) * 240], [340 + Math.cos(b) * 240, 465 + Math.sin(b) * 240]], light, 0.8, 0.8, true, k % 2 ? "#cec5e3" : "#b7aecb");
        }
        for (let i = 0; i < 10; i++) {
          const a = -2.3 + i * 0.15;
          leaf(340 + Math.cos(a) * 170, 465 + Math.sin(a) * 170, 18 + 8 * Math.sin(i), a + time * 0.04, "#526b6a");
        }
        curve((t) => [100 + t * 470, 200 + Math.sin(t * 8 - time) * 15], light, 1.5, progress(0.4, 0.55) * 0.5);
        text("\u98CE\u8FC7\u7AF9\u5F71\uFF0C\u4E07\u8C61\u53EF\u95EE", 340, 545, 17, accent, progress(0.55, 0.7));
      },
      "kimi-art": () => {
        const moon = progress(0.1, 0.68);
        ctx.fillStyle = "#b5c6e2";
        ctx.beginPath();
        ctx.arc(340, 315, 88, 0, tau);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(340, 315, 88, 0, tau);
        ctx.clip();
        ctx.fillStyle = "#172437";
        ctx.beginPath();
        ctx.ellipse(340 + moon * 188, 315, 88, 92, 0, 0, tau);
        ctx.fill();
        ctx.restore();
        ring(340, 330, 190, 72, -0.2, 0.5);
        const a = time * 0.56, x = 340 + Math.cos(a) * 190, y = 330 + Math.sin(a) * 72;
        orb(x, y, 13);
        for (let i = 0; i < 8; i++) orb(160 + i * 49, 495, 3 + 3 * Math.sin(i * Math.PI / 7), accent, progress(i * 0.05, 0.15 + i * 0.05));
        text("\u4ECE\u65B0\u6708\uFF0C\u8D70\u5230\u6EE1\u6708", 340, 548, 18, accent, progress(0.6, 0.74));
      },
      "kimi-anime": () => {
        ring(340, 310, 140, 140, 0, 0.8);
        ring(340, 310, 154, 154, 0, 0.3);
        for (let i = 0; i < 12; i++) {
          const a2 = i * tau / 12;
          path([[340 + Math.sin(a2) * 124, 310 - Math.cos(a2) * 124], [340 + Math.sin(a2) * 139, 310 - Math.cos(a2) * 139]], accent, 2, 0.85);
        }
        const q = progress(0.08, 0.68), a = (1 - q) * tau * 2;
        path([[340, 310], [340 + Math.sin(a) * 105, 310 - Math.cos(a) * 105]], light, 3);
        path([[340, 310], [340 + Math.sin(a * 0.2 + 0.8) * 65, 310 - Math.cos(a * 0.2 + 0.8) * 65]], accent, 5);
        orb(340, 310, 8);
        const swing = Math.sin(time * 2.4) * 0.45 * (1 - progress(0.5, 0.75));
        path([[340, 440], [340 + Math.sin(swing) * 125, 440 + Math.cos(swing) * 100]], accent, 2);
        orb(340 + Math.sin(swing) * 125, 440 + Math.cos(swing) * 100, 13);
      },
      "grok-art": () => {
        const q = progress(0.03, 0.7);
        ctx.fillStyle = "#070a12";
        ctx.beginPath();
        ctx.arc(340, 315, 65 + 16 * q, 0, tau);
        ctx.fill();
        for (let k = 0; k < 20; k++) {
          const r = 90 + k * 4;
          curve((t) => {
            const a = t * tau + time * (0.25 + k * 0.015);
            return [340 + Math.cos(a) * r, 315 + Math.sin(a) * r * 0.3 + Math.sin(a * 2) * 20];
          }, k % 3 ? light : accent, 1.5, (0.15 + 0.4 * q) * (1 - k / 28));
        }
        for (let j = 0; j < 5; j++) curve((t) => {
          const x = 100 + t * 480, d = (x - 340) / 90;
          return [x, 205 + j * 47 + Math.exp(-d * d) * (j - 2) * 32 * q];
        }, accent, 1, 0.3);
        ring(340, 315, 82, 82, 0, 0.8);
        text("\u7A7F\u8FC7\u672A\u77E5\u7684\u5F15\u529B", 340, 540, 20, accent, progress(0.6, 0.72));
      },
      "grok-anime": () => {
        const q = progress(0.08, 0.6), gap = mix(144, 89, q), word = "GROK";
        for (let i = 0; i < 4; i++) {
          const x2 = 340 + (i - 1.5) * gap, y = 365 + (i % 2 ? 1 : -1) * 85 * (1 - q);
          strokeText(word[i], x2, y, 120, "#d4b67e");
          if (q > 0.55) text(word[i], x2, y, 120, "#e9d7b0", ease2(0.55, 1, q) * 0.85);
        }
        const x = mix(120, 560, progress(0.4, 0.72));
        path([[x - 35, 198], [x + 20, 420]], accent, 3, 0.6 * Math.sin(progress(0.35, 0.78) * Math.PI));
        path([[150, 435], [530, 435]], "#ad8b57", 1, progress(0.5, 0.65));
        text("\u597D\u5947\uFF0C\u4E0D\u8BBE\u8FB9\u754C", 340, 498, 19, accent, progress(0.62, 0.75));
      },
      "seed-art": () => {
        path([[150, 470], [540, 470]], light, 1, 0.4);
        const fall = progress(0.01, 0.16);
        orb(340, mix(210, 468, fall), 9, accent, 1 - progress(0.18, 0.25));
        curve((t) => [340 + Math.sin(t * 7) * 12, 470 - t * 245], light, 4, 1, 0, progress(0.16, 0.66));
        for (let i = 0; i < 9; i++) {
          const q = progress(0.24 + i * 0.035, 0.4 + i * 0.035), side = i % 2 ? -1 : 1, x = 340 + Math.sin(i) * 9, y = 440 - i * 24;
          curve((t) => [x + side * t * 80 * q, y - t * 45 * q], light, 2, 0.8);
          leaf(x + side * 72 * q, y - 40 * q, 35 * q, side < 0 ? -2.6 : -0.55);
        }
        for (let i = 0; i < 5; i++) curve((t) => [340 + (i - 2) * 35 * t, 470 + Math.sin(t) * 50], light, 1.3, 0.4, 0, progress(0.18, 0.4));
        text("\u4ECE\u4E00\u7C92\u79CD\u5B50\u5F00\u59CB", 340, 570, 19, accent, progress(0.65, 0.78));
      },
      "seed-anime": () => {
        const q = progress(0.05, 0.63), fold = Math.cos((1 - q) * Math.PI * 0.48), r = 125;
        transform(340, 330, -0.25, () => {
          path([[0, -r], [r * fold, 0], [0, r], [-r * fold, 0]], light, 2, 1, true, "#84a475");
          path([[0, -r], [0, r]], accent, 2, 0.9);
          for (let i = 1; i < 6; i++) {
            const y = -r + i * 40, x = (r - Math.abs(y)) * 0.8 * fold;
            path([[0, y + 12], [x, y - 17]], accent, 1, 0.65);
            path([[0, y + 12], [-x, y - 17]], accent, 1, 0.65);
          }
        });
        for (let i = 0; i < 3; i++) leaf(305 + i * 28, 463, 26 * progress(0.5 + i * 0.04, 0.67 + i * 0.04), -1.1 - i * 0.4);
        text("\u6298\u8D77\u4E00\u7247\u65B0\u7EFF", 340, 540, 19, accent, progress(0.62, 0.75));
      },
      "copilot-art": () => {
        const speed = progress(0.02, 0.4), vanish = [340, 225];
        for (let i = -4; i <= 4; i++) path([vanish, [340 + i * 100, 545]], light, 1, 0.24);
        for (let i = 0; i < 12; i++) {
          const z = (i / 12 + time * 0.11 * speed) % 1, y = 225 + z * z * 320;
          path([[340 - z * 330, y], [340 + z * 330, y]], light, 2, z * 0.5);
        }
        for (let i = 0; i < 6; i++) {
          const z = (i / 6 + time * 0.07) % 1;
          ctx.save();
          ctx.globalAlpha *= Math.sin(z * Math.PI) * 0.6;
          const y = 230 + z * z * 280;
          path([[340 - z * 220, y], [340 - z * 220, y - z * 155], [340 + z * 220, y - z * 155], [340 + z * 220, y]], accent, 2);
          ctx.restore();
        }
        path([[315, 365], [340, 333], [365, 365], [340, 352]], accent, 2, 1, true, "#a8cef0");
        text("\u822A\u7EBF\u5DF2\u5C31\u7EEA", 340, 585, 18, accent, progress(0.58, 0.73));
      },
      "copilot-anime": () => {
        const fold = progress(0.02, 0.28), flight = progress(0.3, 0.78), a = flight * tau * 0.82, x = 340 + Math.sin(a) * 180 * flight, y = 330 - Math.sin(a * 0.5) * 125;
        transform(x, y, -0.32 - flight * 0.8, () => {
          path([[-100, 60], [85, -40], [-20, 75], [-32, 13]], light, 2, 1, true, "#ccdce7");
          path([[-100, 60], [-32, 13], [85, -40], [mix(-100, -20, fold), mix(60, 75, fold)]], accent, 1.5, 1, true, "#91b3cc");
          path([[-32, 13], [-20, 75]], "#516b82", 1.5);
        });
        curve((t) => {
          const a2 = t * tau * 0.82;
          return [340 + Math.sin(a2) * 180 * t, 330 - Math.sin(a2 * 0.5) * 125];
        }, light, 1, 0.55, 0, flight);
        ring(340, 275, 145, 70, 0, 0.25);
        text("\u628A\u7075\u611F\u9001\u5411\u8FDC\u65B9", 340, 540, 18, accent, progress(0.62, 0.76));
      },
      "perplexity-art": () => {
        const nodes = [[155, 340], [265, 230], [270, 440], [400, 200], [420, 340], [435, 470], [555, 310]], edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [5, 6]];
        edges.forEach(([a, b], i) => {
          const q = progress(0.1 + i * 0.035, 0.25 + i * 0.035), from = nodes[a], to = nodes[b];
          path([from, [mix(from[0], to[0], q), mix(from[1], to[1], q)]], light, 1.6, 0.65);
          const flow = (time * 0.35 + i * 0.1) % 1;
          if (q === 1) orb(mix(from[0], to[0], flow), mix(from[1], to[1], flow), 5, accent, 0.75);
        });
        nodes.forEach(([x, y], i) => {
          const q = progress(i * 0.035, 0.1 + i * 0.035);
          ring(x, y, i === 0 || i === 6 ? 23 : 13, void 0, 0, q);
          orb(x, y, 7, light, q);
        });
        text("?", 155, 347, 20);
        text("\u2713", 555, 317, 20, accent, progress(0.55, 0.68));
        text("\u8BA9\u95EE\u9898\u627E\u5230\u8DEF\u5F84", 340, 565, 18, accent, progress(0.6, 0.75));
      },
      "perplexity-anime": () => {
        const focus = progress(0.05, 0.67);
        for (let i = 0; i < 14; i++) {
          const x = 170 + i * 97 % 345, y = 200 + i * 61 % 240;
          orb(x, y, mix(15, 3, focus), i % 2 ? light : accent, 0.45);
        }
        for (let k = 0; k < 2; k++) {
          const x = mix(k ? 470 : 210, 340, focus);
          ring(x, 325, 104 + k * 20, 104 + k * 20, 0, 0.8);
          ring(x, 325, 98 + k * 20, 98 + k * 20, 0, 0.3);
          path([[x + 75, 407], [x + 117, 450]], accent, 5, 0.7);
        }
        path([[322, 325], [358, 325]], accent, 1.5);
        path([[340, 307], [340, 343]], accent, 1.5);
        orb(340, 325, 7, accent, focus);
        text("\u5BF9\u7126\u5B8C\u6210 \xB7 \u53D1\u73B0\u7B54\u6848", 340, 545, 18, accent, progress(0.64, 0.75));
      },
      "minimax-art": () => {
        const rotation = time * progress(0.1, 0.3) * 1.3;
        ctx.fillStyle = "#152330";
        ctx.beginPath();
        ctx.arc(320, 325, 140, 0, tau);
        ctx.fill();
        for (let r = 40; r < 140; r += 7) ring(320, 325, r, r, 0, 0.22);
        transform(320, 325, rotation, () => {
          path([[0, -132], [20, -39]], light, 18, 0.08);
          orb(0, 0, 35, light, 0.85);
          text("M", 0, 8, 24, "#24363d");
        });
        const needle = progress(0.02, 0.23);
        path([[530, 190], [mix(520, 461, needle), 315], [mix(510, 425, needle), 349]], accent, 7, 0.9);
        orb(530, 190, 12, accent);
        for (let i = 0; i < 3; i++) {
          const u = (time * 0.25 + i / 3) % 1;
          ring(320, 325, 145 + u * 65, 145 + u * 65, 0, (1 - u) * 0.25 * progress(0.22, 0.35));
        }
        text("\u628A\u6B64\u523B\uFF0C\u8C03\u6210\u559C\u6B22\u7684\u9891\u7387", 340, 555, 17, accent, progress(0.6, 0.75));
      },
      "minimax-anime": () => {
        const pluck = progress(0.18, 0.6), decay = 1 - progress(0.68, 0.85), opened = progress(0.01, 0.18);
        for (let k = 0; k < 7; k++) {
          const y = 220 + k * 32;
          curve((t) => [345 + (t - 0.5) * 390 * opened, y + Math.sin(t * Math.PI) * Math.sin(t * 20 - time * 5 + k) * 18 * Math.sin(pluck * Math.PI) * decay], k % 2 ? accent : light, 1.6, 0.8);
          orb(345 - 195 * opened, y, 4, light);
          orb(345 + 195 * opened, y, 4, light);
        }
        const x = mix(145, 545, pluck);
        path([[x, 195], [x + 12, 443]], accent, 1.3, Math.sin(pluck * Math.PI));
        orb(x, 315, 18, light, Math.sin(pluck * Math.PI));
        text("\u6BCF\u4E00\u9053\u56DE\u54CD\uFF0C\u90FD\u6709\u56DE\u5E94", 340, 545, 18, accent, progress(0.64, 0.76));
      },
      aurora: () => {
        for (let k = 0; k < 65; k++) {
          const x = 125 + k * 7.2, y = 240 + Math.sin(k * 0.065 + time * 0.28) * 55;
          const h = (100 + 70 * Math.sin(k * 0.08 + time * 0.2)) * progress(0.02, 0.55);
          const g = ctx.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, light + "00");
          g.addColorStop(0.6, k % 3 ? light + "70" : accent + "70");
          g.addColorStop(1, light + "00");
          ctx.fillStyle = g;
          ctx.fillRect(x, y, 4, h);
        }
        path([[100, 485], [190, 390], [268, 452], [370, 370], [460, 457], [580, 406], [600, 510]], "#a8c1cd", 1, 0.7, true, "#1f3648");
        text("\u6781\u591C\u4E4B\u4E0A\uFF0C\u5149\u6B63\u5728\u6D41\u52A8", 340, 555, 18, accent, progress(0.6, 0.76));
      },
      sakura: () => {
        curve((t) => [125 + t * 430, 460 - 220 * t + 45 * Math.sin(t * 4)], "#ac8b9f", 5, 0.9);
        for (let i = 0; i < 10; i++) {
          const q = progress(0.05 + i * 0.045, 0.2 + i * 0.045), x = 165 + i * 38, y = 440 - i * 19 + Math.sin(i * 2) * 25;
          path([[x - 24, y + 35], [x, y]], "#ac8b9f", 2, 0.8);
          for (let k = 0; k < 5; k++) transform(x, y, k * tau / 5 + time * 0.015, () => {
            ctx.fillStyle = k % 2 ? light : accent;
            ctx.beginPath();
            ctx.ellipse(0, -12 * q, 7 * q, 13 * q, 0, 0, tau);
            ctx.fill();
          });
          orb(x, y, 4, accent, q);
        }
        const drift = progress(0.56, 0.85);
        for (let k = 0; k < 5; k++) leaf(240 + k * 53 + drift * 85, 300 + k * 16 + drift * 130, 9 * drift, k + time * 0.2, light);
      },
      city: () => {
        const heights = [100, 170, 135, 220, 190, 145, 110];
        heights.forEach((h, i) => {
          const x = 120 + i * 66;
          ctx.fillStyle = "#152d3d";
          ctx.fillRect(x, 465 - h, 50, h);
          path([[x, 465], [x, 465 - h], [x + 50, 465 - h], [x + 50, 465]], light, 1, 0.35);
          for (let row = 0; row < h / 18 - 1; row++) for (let col = 0; col < 3; col++) {
            ctx.save();
            ctx.globalAlpha *= progress(0.08 + i * 0.055 + row * 0.012, 0.13 + i * 0.055 + row * 0.012);
            ctx.fillStyle = (col + row + i) % 3 ? light : accent;
            ctx.fillRect(x + 8 + col * 12, 475 - h + row * 18, 5, 8);
            ctx.restore();
          }
        });
        const q = progress(0.05, 0.68);
        path([[95, 485], [95 + q * 515, 485]], accent, 3);
        orb(95 + q * 515, 485, 11, accent);
        text("\u6574\u5EA7\u57CE\u5E02\uFF0C\u4E0E\u4F60\u8FDE\u63A5", 340, 555, 18, accent, progress(0.61, 0.75));
      },
      ocean: () => {
        const fall = progress(0.01, 0.24), hit = progress(0.24, 0.78);
        orb(340, mix(170, 385, fall), 12, accent, 1 - progress(0.24, 0.29));
        for (let i = 0; i < 7; i++) {
          const r = Math.max(0, hit * 260 - i * 24);
          if (r) ring(340, 385, r, r * 0.27, 0, (1 - hit) * 0.65 + Math.sin(hit * Math.PI) * 0.2, i % 2 ? light : accent);
        }
        if (p > 0.24) for (let i = 0; i < 12; i++) {
          const a = i * tau / 12, h = progress(0.24, 0.49);
          orb(340 + Math.cos(a) * h * 120, 385 + Math.sin(a) * h * 30 - Math.sin(h * Math.PI) * 80, 3, light, 1 - h);
        }
        path([[115, 390], [565, 390]], light, 1, 0.16);
        text("\u4E00\u6EF4\u7075\u611F\uFF0C\u63A8\u5F00\u4E07\u9877\u6D9F\u6F2A", 340, 550, 17, accent, progress(0.58, 0.74));
      },
      orbit: () => {
        orb(340, 325, 85, accent, 0.8);
        for (let k = 0; k < 4; k++) {
          const align = progress(0.08 + k * 0.04, 0.65 + k * 0.02), tilt = mix(k * 0.7 - 0.8, 0.32, align), r = 120 + k * 26;
          curve((t) => project(Math.cos(t * tau) * r, Math.sin(t * tau) * r, 0, k * 0.2, tilt), light, 1.4, 0.6);
          const a = time * (0.45 - k * 0.06) + k;
          const pos = project(Math.cos(a) * r, Math.sin(a) * r, 0, k * 0.2, tilt);
          orb(...pos, 9 - k, accent);
        }
        text("\u76F8\u9694\u4E07\u91CC\uFF0C\u7EC8\u5C06\u4F1A\u5408", 340, 555, 18, accent, progress(0.62, 0.76));
      },
      ink: () => {
        ctx.save();
        ctx.globalAlpha *= 0.94;
        ctx.fillStyle = "#ede8d9";
        ctx.fillRect(100, 180, 490, 330);
        ctx.restore();
        for (let k = 0; k < 5; k++) {
          const points = [];
          const q = progress(0.03 + k * 0.085, 0.27 + k * 0.085);
          for (let j = 0; j <= 80 * q; j++) {
            const t = j / 80;
            points.push([125 + t * 440, 420 - k * 26 - 50 * Math.sin(t * 5 + k * 0.7) - 35 * Math.sin(t * 13 + k)]);
          }
          path(points, "#526c67", 6 - k, 0.7);
        }
        for (let i = 0; i < 3; i++) {
          const q = progress(0.57, 0.78), x = 220 + i * 70 + q * 80, y = 245 + i * 18;
          path([[x - 10, y], [x, y - 5], [x + 10, y]], "#506963", 1.5, q);
        }
        stamp("\u5C71", 535, 452);
      },
      forest: () => {
        for (let i = 0; i < 9; i++) {
          const x = 130 + i * 53, h = 110 + i % 3 * 35;
          path([[x, 480 - h], [x - 30, 480], [x + 30, 480]], light, 1, 0.18, true, "#153b39");
        }
        const q = progress(0.03, 0.8);
        curve((t) => [125 + t * 450, 465 - t * 180 + 30 * Math.sin(t * 9)], light, 1.5, 0.35, 0, q);
        for (let i = 0; i < 20; i++) {
          const u = i / 20, x = 125 + u * 450, y = 465 - u * 180 + 30 * Math.sin(u * 9), lit = progress(u * 0.6, 0.1 + u * 0.6);
          orb(x, y + Math.sin(time + i) * 4, 7, light, lit * 0.65);
        }
        orb(125 + q * 450, 465 - q * 180 + 30 * Math.sin(q * 9), 15, accent);
        text("\u8DDF\u7740\u5FAE\u5149\uFF0C\u627E\u5230\u5F52\u9014", 340, 555, 18, accent, progress(0.65, 0.78));
      },
      crystal: () => {
        const rotation = time * 0.25, vertices = [[0, -155, 0], [0, 155, 0], [-120, 0, 0], [120, 0, 0], [0, 0, -110], [0, 0, 110]];
        const faces = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 4], [1, 4, 3], [1, 3, 5], [1, 5, 2]];
        faces.forEach((face, i) => {
          const q = progress(0.02 + i * 0.04, 0.22 + i * 0.04);
          path(face.map((v) => project(...vertices[v], rotation, 0.3)), i % 2 ? light : accent, 1.5, q, true, (i % 2 ? light : accent) + "18");
        });
        const beam = progress(0.38, 0.7);
        path([[95, 325], [340, 325], [340 + beam * 240, 325 - beam * 120]], accent, 2, beam);
        path([[340, 325], [340 + beam * 240, 325 + beam * 100]], light, 2, beam);
        orb(340, 325, 25, accent, beam);
      }
    };
    const drawScene = scenes[spec.theme.id];
    if (!drawScene) throw Error("\u4E3B\u9898\u6F14\u51FA\u672A\u5B9E\u73B0\uFF1A" + spec.theme.id);
    canvas.dataset.intro = spec.theme.id;
    canvas.dataset.sequence = spec.theme.id;
    canvas.dataset.deformation = "none";
    function draw(seconds) {
      p = clamp2(seconds * 1e3 / spec.durationMs);
      time = p * 12;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
      canvas.dataset.phase = p < 0.25 ? "opening" : p < 0.57 ? "interaction" : p < story.exit ? "resolution" : p < 1 ? "handoff" : "complete";
      if (p >= 1) return;
      const exit = 1 - ease2(story.exit, 1, p);
      ctx.save();
      ctx.scale(canvas.width / 1280, canvas.height / 720);
      ctx.globalAlpha = exit;
      const shade = ctx.createLinearGradient(0, 0, 1060, 0);
      shade.addColorStop(0, "#050b14ee");
      shade.addColorStop(0.48, "#050b14e0");
      shade.addColorStop(1, "#050b1400");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, 1280, 720);
      const ambient = ctx.createRadialGradient(340, 320, 30, 340, 320, 350);
      ambient.addColorStop(0, light + "15");
      ambient.addColorStop(1, light + "00");
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, 750, 720);
      drawScene();
      text(spec.theme.name, 90, 86, 26, accent, 0.9, "left");
      text(story.name, 92, 120, 15, light, 0.7, "left");
      const beat = p < 0.25 ? 0 : p < 0.57 ? 1 : 2;
      text(story.beats[beat], 92, 632, 18, accent, 0.8, "left");
      ctx.restore();
    }
    return { draw, dispose() {
    } };
  }

  // src/gallery-motion.ts
  function createGalleryScene(spec, surface) {
    const canvas = surface || document.createElement("canvas");
    canvas.id = "aemeath-living-wallpaper";
    canvas.style.cssText = `position:fixed;left:var(--player-client-x,0px);top:var(--player-client-y,0px);width:var(--player-client-width,100%);height:var(--player-client-height,100%);pointer-events:none;z-index:0;opacity:${(spec.opacity ?? 100) / 100}`;
    canvas.setAttribute("aria-hidden", "true");
    if (!surface) document.body.prepend(canvas);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, seconds = 0, last = 0, started = !surface && spec.mode === "background", disposed = false, loaded = false, frames = 0;
    const smooth = (a, b, x) => {
      const p = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return p * p * (3 - 2 * p);
    };
    let draw = () => {
    }, release = () => {
    };
    const resize = () => {
      const style = document.documentElement.style, width = parseFloat(style.getPropertyValue("--player-client-width")) || innerWidth, height = parseFloat(style.getPropertyValue("--player-client-height")) || innerHeight;
      const scale = Math.min(devicePixelRatio || 1, 1.5, 1500 / width);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      if (loaded) draw(seconds);
    };
    resize();
    const ready = (async () => {
      if (spec.mode === "warm") {
        const source = document.createElement("canvas"), backdrop = createGalleryScene({ ...spec, mode: "background", opacity: 100, handoff: void 0 }, source);
        let destination, interaction;
        release = () => {
          interaction?.dispose();
          destination?.dispose();
          backdrop.dispose();
        };
        await backdrop.ready;
        backdrop.seek(0);
        const target = spec.handoff ? document.createElement("canvas") : source;
        if (spec.handoff) {
          destination = createGalleryScene({ ...spec.handoff, mode: "background", opacity: 100, handoff: void 0 }, target);
          await destination.ready;
          destination.seek(0);
        }
        if (disposed) {
          release();
          return false;
        }
        interaction = await createWarmScene(canvas, source, spec);
        if (disposed) {
          release();
          return false;
        }
        draw = (time) => {
          const t = reduced.matches ? spec.durationMs / 1e3 : time;
          interaction.draw(t);
          if (destination) {
            const p = smooth(0.65, 1, t * 1e3 / spec.durationMs), ctx = canvas.getContext("2d");
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = p;
            ctx.drawImage(target, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        };
      } else if (spec.mode === "cold") {
        const source = document.createElement("canvas"), backdrop = createGalleryScene({ ...spec, mode: "background", opacity: 100, handoff: void 0 }, source);
        release = () => backdrop.dispose();
        if (!await backdrop.ready || disposed) {
          backdrop.dispose();
          return false;
        }
        backdrop.seek(0);
        const cinematic = createColdCinematic(canvas, source, spec);
        draw = (time) => cinematic.draw(reduced.matches ? spec.durationMs / 1e3 : time);
        release = () => {
          cinematic.dispose();
          backdrop.dispose();
        };
      } else if (spec.imageURL) {
        const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
        if (!gl) throw Error("\u4EBA\u7269\u52A8\u753B\u9700\u8981 WebGL\uFF0C\u8BF7\u542F\u7528\u786C\u4EF6\u52A0\u901F");
        const image = new Image(), closedImage = new Image();
        await Promise.all([[image, spec.imageURL], [closedImage, spec.closedURL || spec.imageURL]].map(([entry, url]) => new Promise((resolve, reject) => {
          const picture = entry;
          picture.onload = () => resolve();
          picture.onerror = () => reject(Error("\u56FE\u5E93\u4EBA\u7269\u7D20\u6750\u52A0\u8F7D\u5931\u8D25"));
          picture.src = url;
        })));
        if (disposed) return false;
        const program = gl.createProgram(), shaders = [];
        const shader = (type, source) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, source);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s) || "\u7740\u8272\u5668\u5931\u8D25");
          gl.attachShader(program, s);
          shaders.push(s);
        };
        shader(gl.VERTEX_SHADER, `attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}`);
        shader(gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 uv;uniform sampler2D picture,closedPicture;uniform vec2 viewSize,imageSize,eyeSize;uniform vec4 eyes;uniform float time,opening,reveal,contain;
        float mask(vec2 p,vec2 c,vec2 r){return 1.-smoothstep(.6,1.,length((p-c)/r));}
        vec3 eye(vec2 p,vec2 c,vec3 color){vec2 d=p-c;float slope=(eyes.w-eyes.y)/max(.01,eyes.z-eyes.x);d.y-=slope*d.x;float m=1.-smoothstep(.72,1.,length(d/(eyeSize*vec2(1.25,1.6))));
          vec2 q=p;q.y=c.y+slope*d.x+d.y/(.55+.45*opening);vec3 compressed=texture2D(picture,q).rgb;
          vec3 closed=texture2D(closedPicture,p).rgb;return mix(color,mix(closed,compressed,opening),m);
        }
        void main(){float cover=max(viewSize.x/imageSize.x,viewSize.y/imageSize.y);float fit=min(viewSize.x/imageSize.x,viewSize.y/imageSize.y);float s=mix(cover,fit,contain);vec2 p=(uv*viewSize-(viewSize-imageSize*s)*.5)/(imageSize*s);if(p.x<0.||p.y<0.||p.x>1.||p.y>1.){gl_FragColor=vec4(.035,.05,.08,1.);return;}
          vec2 face=vec2((eyes.x+eyes.z)*.5,(eyes.y+eyes.w)*.5);float noFace=1.-mask(p,face,vec2(.11,.13));float hair=mask(p,vec2(face.x,face.y+.22),vec2(.24,.48))*noFace;vec2 q=p;q.x+=hair*sin(time*1.05+p.y*14.)*.0022*smoothstep(0.,1.,time);q.y+=hair*sin(time*.7+p.x*12.)*.0006;
          vec3 color=texture2D(picture,q).rgb;color=eye(p,eyes.xy,color);color=eye(p,eyes.zw,color);
          float glow=0.;for(int i=0;i<24;i++){float f=float(i);vec2 c=vec2(fract(sin(f*78.21)*431.5),fract(f*.317-time*.014));float d=length((uv-c)*vec2(viewSize.x/viewSize.y,1.));glow+=.000018/(d*d+.00004)*(.45+.55*sin(f+time));}
          color+=vec3(.17,.19,.21)*glow;float sweep=exp(-pow((uv.x-reveal*1.6+.3)*9.,2.))*(1.-reveal);color+=sweep*.32;gl_FragColor=vec4(color*(.35+.65*reveal),1.);
        }`);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("\u4EBA\u7269\u52A8\u753B\u521D\u59CB\u5316\u5931\u8D25");
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const textures = [image, closedImage].map((picture, index) => {
          const texture = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, picture);
          gl.uniform1i(gl.getUniformLocation(program, index ? "closedPicture" : "picture"), index);
          return texture;
        });
        const uniform = (name) => gl.getUniformLocation(program, name);
        const uTime = uniform("time"), uOpen = uniform("opening"), uReveal = uniform("reveal"), uView = uniform("viewSize");
        gl.uniform2f(uniform("imageSize"), image.width, image.height);
        gl.uniform4fv(uniform("eyes"), spec.theme.eyes || [0.68, 0.2, 0.72, 0.2]);
        gl.uniform2fv(uniform("eyeSize"), spec.theme.eyeSize || [0.02, 0.02]);
        gl.uniform1f(uniform("contain"), spec.fit === "contain" ? 1 : 0);
        draw = (time) => {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(uView, canvas.width, canvas.height);
          gl.uniform1f(uTime, time);
          const progress = time / (spec.durationMs / 1e3);
          const phase = time % 5.4;
          const blink = smooth(4.7, 4.81, phase) * (1 - smooth(4.9, 5.08, phase));
          const opening = spec.mode === "warm" ? smooth(0.12, 0.78, progress) : 1 - blink;
          gl.uniform1f(uOpen, reduced.matches ? 1 : opening);
          gl.uniform1f(uReveal, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.flush();
        };
        release = () => {
          textures.forEach((texture) => gl.deleteTexture(texture));
          gl.deleteBuffer(buffer);
          shaders.forEach((s) => gl.deleteShader(s));
          gl.deleteProgram(program);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
      } else {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw Error("\u573A\u666F\u753B\u5E03\u4E0D\u53EF\u7528");
        const [dark, light, accent] = spec.theme.colors, effect = spec.theme.effect;
        const dot = (x, y, r, color) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        };
        const mountain = (base, height, color, seed) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, 720);
          for (let x = 0; x <= 1280; x += 8) ctx.lineTo(x, base - Math.sin(x * 4e-3 + seed) * height - Math.sin(x * 0.011 + seed) * height * 0.35);
          ctx.lineTo(1280, 720);
          ctx.fill();
        };
        draw = (time) => {
          ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
          ctx.globalAlpha = 1;
          const gradient = ctx.createLinearGradient(0, 0, 0, 720);
          gradient.addColorStop(0, dark);
          gradient.addColorStop(1, effect === "ink" ? "#f4f0e6" : "#172b40");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 1280, 720);
          if (effect !== "ink") for (let i = 0; i < 90; i++) {
            ctx.globalAlpha = 0.18 + 0.35 * (1 + Math.sin(time * 0.7 + i));
            dot(i * 137.37 % 1280, i * 73.23 % 530, 0.5 + i % 3 * 0.5, light);
          }
          ctx.globalAlpha = 1;
          if (effect === "aurora") {
            for (let band = 0; band < 3; band++) for (let i = 0; i < 32; i++) {
              ctx.beginPath();
              for (let x = 0; x <= 1280; x += 12) {
                const y = 150 + band * 60 + Math.sin(x * 4e-3 + time * 0.18 + band) * 90 + i * 3;
                x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
              }
              ctx.strokeStyle = band % 2 ? accent : light;
              ctx.globalAlpha = 0.015 * (1 - i / 38);
              ctx.lineWidth = 7;
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            mountain(560, 100, "#283d55", 1);
            mountain(635, 58, "#102330", 3);
          } else if (effect === "ocean") {
            dot(860, 190, 64, accent);
            for (let i = 0; i < 65; i++) {
              const y = 400 + i * 5;
              ctx.strokeStyle = light;
              ctx.globalAlpha = 0.1 + i * 4e-3;
              ctx.beginPath();
              for (let x = 0; x < 1280; x += 12) {
                const py = y + Math.sin(x * 0.013 - time * 0.7 + i) * (0.5 + i * 0.14);
                x ? ctx.lineTo(x, py) : ctx.moveTo(x, py);
              }
              ctx.stroke();
            }
            ctx.globalAlpha = 0.28;
            for (let i = 0; i < 45; i++) {
              const x = 860 + Math.sin(i * 9) * i * 3;
              ctx.fillStyle = accent;
              ctx.fillRect(x, 410 + i * 6, 10 + i * 0.8, 1.5);
            }
          } else if (effect === "city") {
            dot(960, 160, 80, "#332947");
            for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 22; i++) {
              const x = i * 65 + layer * 16, h = 60 + (Math.sin(i * 13 + layer) * 0.5 + 0.5) * 200;
              ctx.fillStyle = ["#14263c", "#15213b", "#0a1429"][layer];
              ctx.globalAlpha = 1;
              ctx.fillRect(x, 550 - h + layer * 28, 48, h);
              for (let row = 0; row < h / 14; row++) for (let col = 0; col < 3; col++) {
                ctx.globalAlpha = Math.sin(i + row + time * 0.2) > -0.4 ? 0.7 : 0.15;
                ctx.fillStyle = i % 2 ? light : accent;
                ctx.fillRect(x + 8 + col * 12, 555 - h + layer * 28 + row * 14, 3, 5);
              }
            }
            ctx.strokeStyle = light;
            ctx.globalAlpha = 0.24;
            for (let i = 0; i < 100; i++) {
              let x = i * 97 % 1280, y = (i * 43 + time * 160) % 720;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x - 12, y + 34);
              ctx.stroke();
            }
          } else if (effect === "orbit") {
            const g = ctx.createRadialGradient(760, 330, 10, 790, 350, 145);
            g.addColorStop(0, accent);
            g.addColorStop(0.6, light);
            g.addColorStop(1, "#252b50");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(790, 350, 145, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.translate(790, 350);
            ctx.rotate(-0.3);
            for (let i = 0; i < 5; i++) {
              ctx.strokeStyle = i % 2 ? light : accent;
              ctx.globalAlpha = 0.3;
              ctx.lineWidth = 1 + i;
              ctx.beginPath();
              ctx.ellipse(0, 0, 240 + i * 8, 70 + i * 5, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
            ctx.globalAlpha = 0.9;
            dot(790 + Math.cos(time * 0.2) * 280, 350 + Math.sin(time * 0.2) * 120, 9, accent);
          } else if (effect === "ink") {
            dot(920, 160, 46, accent);
            mountain(390, 90, "#a3b3ad", 2);
            mountain(490, 110, "#7f9690", 4);
            mountain(600, 90, "#526d6b", 1);
            for (let i = 0; i < 5; i++) {
              ctx.strokeStyle = light;
              ctx.lineWidth = 2;
              ctx.beginPath();
              let x = (time * 18 + i * 51) % 1500 - 100, y = 160 + Math.sin(i) * 30;
              ctx.moveTo(x - 9, y);
              ctx.quadraticCurveTo(x - 3, y - 6 - Math.sin(time * 3) * 3, x, y);
              ctx.quadraticCurveTo(x + 3, y - 6 - Math.sin(time * 3) * 3, x + 9, y);
              ctx.stroke();
            }
          } else if (effect === "forest") {
            for (let i = 0; i < 30; i++) {
              const x = i * 51, h = 190 + i % 5 * 45;
              ctx.fillStyle = i % 2 ? "#173e3b" : "#0a292d";
              ctx.beginPath();
              ctx.moveTo(x, 610 - h);
              ctx.lineTo(x - 65, 650);
              ctx.lineTo(x + 75, 650);
              ctx.fill();
              ctx.fillStyle = "#163435";
              ctx.fillRect(x - 4, 500, 8, 220);
            }
            for (let i = 0; i < 50; i++) {
              ctx.globalAlpha = 0.3 + 0.7 * Math.pow(Math.sin(time + i), 2);
              dot((i * 129 + Math.sin(time * 0.3 + i) * 12) % 1280, 350 + i * 53 % 340 + Math.sin(time + i) * 12, 1.5, light);
            }
          } else if (effect === "sakura") {
            dot(920, 170, 68, accent);
            mountain(580, 50, "#443449", 1);
            ctx.strokeStyle = "#4f3446";
            ctx.lineCap = "round";
            for (let b = 0; b < 9; b++) {
              ctx.lineWidth = 14 - b;
              ctx.beginPath();
              ctx.moveTo(1280, 600);
              ctx.quadraticCurveTo(1150 - b * 20, 180 + b * 25, 680 + b * 65, 90 + b * 18);
              ctx.stroke();
              for (let j = 0; j < 18; j++) {
                dot(760 + b * 51 + Math.sin(j * 7) * 90, 100 + b * 20 + Math.cos(j * 3) * 45, 4 + j % 4, j % 2 ? light : "#e1c3d4");
              }
            }
            for (let i = 0; i < 65; i++) {
              ctx.save();
              ctx.translate((i * 97 + time * 17) % 1350, (i * 53 + time * 26) % 760);
              ctx.rotate(time + i);
              ctx.fillStyle = light;
              ctx.beginPath();
              ctx.ellipse(0, 0, 5, 2, 0, 0, 7);
              ctx.fill();
              ctx.restore();
            }
          } else {
            for (let k = 0; k < 9; k++) {
              ctx.save();
              ctx.translate(170 + k * 120, 330 + Math.sin(k * 2 + time * 0.4) * 100);
              ctx.rotate(time * 0.12 + k);
              const r = 50 + k % 3 * 20;
              ctx.beginPath();
              for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3, x = Math.cos(a) * r, y = Math.sin(a) * r;
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
              }
              ctx.closePath();
              ctx.fillStyle = k % 2 ? light : accent;
              ctx.globalAlpha = 0.1;
              ctx.fill();
              ctx.globalAlpha = 0.65;
              ctx.lineWidth = 1;
              ctx.strokeStyle = light;
              ctx.stroke();
              for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(i * Math.PI / 3) * r, Math.sin(i * Math.PI / 3) * r);
                ctx.stroke();
              }
              ctx.restore();
            }
          }
          ctx.globalAlpha = 1;
          if (spec.mode === "warm") {
            const p = smooth(0, 0.85, time / (spec.durationMs / 1e3));
            ctx.fillStyle = dark;
            ctx.globalAlpha = (1 - p) * 0.85;
            ctx.fillRect(0, 0, 1280, 720);
            ctx.globalAlpha = (1 - p) * 0.65;
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(640, 360, 30 + p * 720, 0, 7);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        };
      }
      loaded = true;
      draw(0);
      frames++;
      resume();
      return true;
    })().catch((error) => {
      dispose();
      throw error;
    });
    function tick(now) {
      frame = 0;
      if (disposed || !loaded || !started || document.hidden) return;
      if (!last) last = now;
      if (spec.mode !== "background" || now - last >= 1e3 / 30) {
        seconds += Math.min(0.1, (now - last) / 1e3);
        last = now;
        draw(reduced.matches ? spec.durationMs / 1e3 : seconds);
        frames++;
        canvas.dataset.seconds = seconds.toFixed(2);
      }
      frame = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(frame);
      last = 0;
      if (!disposed && loaded && started && !document.hidden && !(reduced.matches && spec.mode === "background")) frame = requestAnimationFrame(tick);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
      release();
      canvas.remove();
    }
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    return { ready, dispose, play() {
      started = true;
      seconds = 0;
      resume();
    }, pause() {
      started = false;
      cancelAnimationFrame(frame);
    }, setStrength(value) {
      canvas.style.opacity = String(value / 100);
    }, seek(time) {
      seconds = time;
      if (loaded) draw(time);
    }, status: () => ({ ready: loaded, active: loaded && !disposed, paused: !started || document.hidden, frames, seconds }) };
  }
  return __toCommonJS(gallery_motion_exports);
})();
