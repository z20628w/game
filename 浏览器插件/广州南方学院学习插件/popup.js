// popup.js
console.log("popup.js");

// 自动学习默认配置
const DEFAULT_CONFIG = {
	speed: 2,          // 目标倍速
	enableSpeed: true, // 自动设置倍速
	enableChain: true, // 自动开启连续播放
	enableModal: true, // 自动确认“提示”弹窗
	enableResume: true // 暂停后自动恢复播放
};

// 可选倍速档位
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let currentConfig = { ...DEFAULT_CONFIG };

document.addEventListener("DOMContentLoaded", async () => {
	// 读取已保存的配置
	try {
		const data = await chrome.storage.local.get("learningConfig");
		if (data.learningConfig) {
			currentConfig = { ...DEFAULT_CONFIG, ...data.learningConfig };
			console.log("读取配置:", currentConfig);
		}
	} catch (e) {
		console.log("读取配置失败:", e);
	}

	renderConfig();
	initPopupFeatures();
});

// 渲染配置表单
function renderConfig() {
	const speedSel = document.getElementById("speed");
	SPEED_OPTIONS.forEach(v => {
		const opt = document.createElement("option");
		opt.value = v;
		opt.textContent = v === 1 ? "1x（原速）" : v + "x";
		speedSel.appendChild(opt);
	});
	// 若保存的倍速不在档位中，追加自定义项
	if (!SPEED_OPTIONS.includes(currentConfig.speed)) {
		const opt = document.createElement("option");
		opt.value = currentConfig.speed;
		opt.textContent = currentConfig.speed + "x（自定义）";
		speedSel.appendChild(opt);
	}
	speedSel.value = currentConfig.speed;
	document.getElementById("enableSpeed").checked = currentConfig.enableSpeed;
	document.getElementById("enableChain").checked = currentConfig.enableChain;
	document.getElementById("enableModal").checked = currentConfig.enableModal;
	document.getElementById("enableResume").checked = currentConfig.enableResume;

	// 配置变化即保存，并通知当前页面立即应用
	["speed", "enableSpeed", "enableChain", "enableModal", "enableResume"].forEach(id => {
		document.getElementById(id).addEventListener("change", () => {
			readConfigFromForm();
			saveConfig();
		});
	});
}

// 从表单读取当前配置
function readConfigFromForm() {
	currentConfig = {
		speed: parseFloat(document.getElementById("speed").value) || DEFAULT_CONFIG.speed,
		enableSpeed: document.getElementById("enableSpeed").checked,
		enableChain: document.getElementById("enableChain").checked,
		enableModal: document.getElementById("enableModal").checked,
		enableResume: document.getElementById("enableResume").checked
	};
}

// 保存配置并通知当前标签页
async function saveConfig() {
	try {
		await chrome.storage.local.set({ learningConfig: currentConfig });
		console.log("配置已保存:", currentConfig);
	} catch (e) {
		console.log("保存配置失败:", e);
	}
	notifyTab({ action: "updateConfig", config: currentConfig });
}

// 向当前活动标签页发送消息（未注入内容脚本时忽略错误）
function notifyTab(message) {
	chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
		const tab = tabs && tabs[0];
		if (!tab) return;
		chrome.tabs.sendMessage(tab.id, message).catch(e => {
			console.log("通知标签页失败（可忽略）:", e);
		});
	});
}

function initPopupFeatures() {
	// 开启获取答案功能
	document.getElementById("getAnswers").addEventListener("click", async () => {
		console.log("开启获取答案功能点击");
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab) return;
		chrome.tabs.sendMessage(tab.id, { action: "getAnswers" }).catch(e => {
			console.log("开启获取答案失败:", e);
		});
	});

	// 开启自动学习功能
	document.getElementById("autLearning").addEventListener("click", async () => {
		console.log("开启自动学习功能点击");
		readConfigFromForm();
		saveConfig(); // 顺手保存最新配置
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab) return;
		chrome.tabs.sendMessage(tab.id, { action: "autLearning", config: currentConfig }).catch(e => {
			console.log("开启自动学习失败:", e);
		});
	});

	// 监听全局发送过来的消息
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		console.log("监听全局发送过来的消息", request, sender);
		if (request.event === "domChanged") {
			console.log("页面已更新: " + request.data);
		}
	});
}
