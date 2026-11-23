(() => {
  const API_BASE = (() => {
    // If frontend is opened via file:// or a different origin, point to local backend.
    const override = window.localStorage.getItem("CARTOONIFY_API");
    if (override) return override.replace(/\/$/, "");
    return "http://127.0.0.1:8000";
  })();

  const $ = (id) => document.getElementById(id);
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const styleSelect = $("styleSelect");
  const strengthInput = $("strengthInput");
  const strengthValue = $("strengthValue");
  const convertBtn = $("convertBtn");
  const resetBtn = $("resetBtn");
  const downloadBtn = $("downloadBtn");
  const statusEl = $("status");
  const originalFrame = $("originalFrame");
  const resultFrame = $("resultFrame");
  const apiStatus = $("apiStatus");

  let currentFile = null;
  let resultBlobUrl = null;

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? ` ${kind}` : "");
  }

  function setFrame(frame, content) {
    frame.innerHTML = "";
    if (typeof content === "string") {
      const span = document.createElement("span");
      span.className = "placeholder";
      span.textContent = content;
      frame.appendChild(span);
    } else {
      frame.appendChild(content);
    }
  }

  function revokeResult() {
    if (resultBlobUrl) {
      URL.revokeObjectURL(resultBlobUrl);
      resultBlobUrl = null;
    }
  }

  async function loadStyles() {
    try {
      const res = await fetch(`${API_BASE}/api/styles`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      styleSelect.innerHTML = "";
      for (const s of data.styles) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name} — ${s.description}`;
        styleSelect.appendChild(opt);
      }
      apiStatus.textContent = "API: 在线";
      apiStatus.className = "online";
    } catch (err) {
      apiStatus.textContent = "API: 离线（请启动后端）";
      apiStatus.className = "offline";
      // Fallback options so the UI is not empty.
      styleSelect.innerHTML = `
        <option value="classic">Classic Cartoon</option>
        <option value="sketch">Pencil Sketch</option>
        <option value="quantize">Color Quantization</option>
        <option value="stylize">Stylization</option>
      `;
      setStatus(`无法连接到后端 ${API_BASE}，请先启动 backend/main.py`, "error");
    }
  }

  function acceptFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("请选择图片文件", "error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus("文件过大（最大 15 MB）", "error");
      return;
    }
    currentFile = file;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => URL.revokeObjectURL(url);  // revoke after image loads
    img.src = url;
    setFrame(originalFrame, img);
    setFrame(resultFrame, "等待生成");
    revokeResult();
    downloadBtn.disabled = true;
    convertBtn.disabled = false;
    resetBtn.disabled = false;
    setStatus(`已选择：${file.name} (${(file.size / 1024).toFixed(1)} KB)`, "ok");
  }

  // Drag & drop
  ;["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    })
  );
  ;["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => acceptFile(e.target.files?.[0]));

  // Paste from clipboard
  document.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) acceptFile(item.getAsFile());
  });

  strengthInput.addEventListener("input", () => {
    strengthValue.textContent = strengthInput.value;
  });

  resetBtn.addEventListener("click", () => {
    currentFile = null;
    fileInput.value = "";
    setFrame(originalFrame, "尚未上传");
    setFrame(resultFrame, "等待生成");
    revokeResult();
    convertBtn.disabled = true;
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
    setStatus("已重置");
  });

  convertBtn.addEventListener("click", async () => {
    if (!currentFile) return;
    convertBtn.disabled = true;
    resultFrame.classList.add("loading");
    setFrame(resultFrame, "正在卡通化…");
    setStatus("处理中…");

    const fd = new FormData();
    fd.append("file", currentFile);
    fd.append("style", styleSelect.value);
    fd.append("strength", strengthInput.value);

    try {
      const t0 = performance.now();
      const res = await fetch(`${API_BASE}/api/cartoonify`, { method: "POST", body: fd });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j.detail) detail = j.detail;
        } catch (_) {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      revokeResult();
      resultBlobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.src = resultBlobUrl;
      setFrame(resultFrame, img);
      downloadBtn.disabled = false;
      const ms = (performance.now() - t0).toFixed(0);
      setStatus(`完成 (${ms} ms)`, "ok");
    } catch (err) {
      setFrame(resultFrame, "处理失败");
      setStatus(`错误：${err.message}`, "error");
    } finally {
      convertBtn.disabled = !currentFile;
      resultFrame.classList.remove("loading");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!resultBlobUrl) return;
    const a = document.createElement("a");
    a.href = resultBlobUrl;
    const base = (currentFile?.name || "image").replace(/\.[^.]+$/, "");
    a.download = `${base}_cartoon_${styleSelect.value}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  loadStyles();
})();
