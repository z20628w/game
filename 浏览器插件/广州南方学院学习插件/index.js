// 答案获取功能
function getDataFn() {
	console.log("页面加载完成");
	let iframeDom = document?.body?.getElementsByTagName("iframe")[0];
	console.log("iframeDom", iframeDom);
	let bodyDom = iframeDom?.contentWindow?.document?.getElementsByTagName("body")[0];
	if (!bodyDom) {
		console.log("body页面不存在");
		return;
	}
	window.getDa = function () {
		let da = Array.from(bodyDom.querySelectorAll(".ui-question-options")).map(t => {
			console.log("t", t);
			return Array.from(t.querySelectorAll(".ui-correct-answer")).map(c => c.getAttribute("code"));
		});
		console.log(da);
		localStorage.setItem("da", JSON.stringify(da));
		alert(da.length ? "答案获取成功" : "答案获取失败");
	};
	window.fillDa = function () {
		console.log("填充答案");
		let da = JSON.parse(localStorage.getItem("da") || "[]");
		console.log("获取到的答案为：", da);
		let domList = Array.from(bodyDom.querySelectorAll(".ui-question-options"));
		console.log("获取到的题目：", domList, bodyDom);
		let fn = (list, index = 0) => {
			console.log("开始填充答案", list, index);
			let t = list[index];
			if (!t) return;
			console.log(`填充第${index + 1}道题`);
			let d = da[index] || [];
			console.log("答案为：", d);
			let fn1 = (arr, i = 0) => {
				if (!arr[i]) {
					/** 下一题事件 */ document.body.querySelector("#next-btn").click();
					fn(list, index + 1);
					return;
				}
				console.log(`点击答案${d[i]}`, d, i);
				t.querySelector(`li[code=${d[i]}] > span.ui-question-options-order`).click();
				setTimeout(() => {
					fn1(d, i + 1);
				}, 500);
			};
			fn1(d);
		};
		fn(domList);
	};
	let getDaDom = document.createElement("button");
	getDaDom.style = "padding:10px;position:fixed;right:100px;top:0px;z-index:10000;background:blue;color:red;font-size:28px;";
	getDaDom.innerText = "获取答案";
	let fillDaDom = document.createElement("button");
	fillDaDom.style = "padding:10px;position:fixed;right:100px;top:100px;z-index:10000;background:blue;color:red;font-size:28px;";
	fillDaDom.innerText = "填写答案";
	getDaDom.onclick = getDa;
	fillDaDom.onclick = fillDa;
	document.body.appendChild(getDaDom);
	document.body.appendChild(fillDaDom);
}

// 自动学习配置（由 popup 传入，持久化在 chrome.storage.local）
let learningConfig = {
	speed: 2,          // 目标倍速
	enableSpeed: true, // 自动设置倍速
	enableChain: true, // 自动开启连续播放
	enableModal: true, // 自动确认“提示”弹窗
	enableResume: true // 暂停后自动恢复播放
};

// 获取页面中的主视频元素（排除人脸弹窗里的 snapVideo）
function getVideoFn() {
	return document.querySelector(".prism-player video")
		|| document.querySelector(".u-edu-h5player video")
		|| document.querySelector(".video-box video")
		|| Array.from(document.querySelectorAll("video")).find(v => v.id !== "snapVideo");
}

// 自动学习方法（兼容新版 Aliplayer 播放器页面与旧版 u-edu-h5player 播放器页面）
function AutLearningFn() {
	// 判断是否为课件学习页面（兼容 #/courseware 与 #/courseware-player 两种路由）
	if (location.href.indexOf("/page/client#/courseware") == -1) {
		console.log("不是课件学习页面");
		return;
	}
	console.log("检测到课件学习页面，开启自动学习，配置：", learningConfig);

	// ---------- 1. 开启连续播放 ----------
	if (learningConfig.enableChain) {
		let targetNode = document.querySelector(".chain-broadcast .ivu-switch") || document.querySelector(".ivu-switch.ivu-switch-default");
		if (targetNode) {
			if (targetNode.className.indexOf("ivu-switch-checked") == -1) {
				console.log("当前未开启连续播放，点击打开");
				targetNode.click();
			} else {
				console.log("当前已开启连续播放");
			}
		} else {
			console.log("未找到连续播放开关");
		}
	}

	// ---------- 2. “提示”类弹窗自动确认（停止计时/时长上限等） ----------
	// 安全策略：仅点击标题为“提示”的弹窗中的“确定”按钮；
	// 测评题、扫码验证、照片采集等弹窗不做自动处理
	if (learningConfig.enableModal) {
		let closeAlertModalFn = () => {
			let hit = false;
			let modalList = document.querySelectorAll(".v-transfer-dom .ivu-modal-wrap");
			modalList.forEach(wrap => {
				// 弹窗可见性：遮罩显示且弹窗未隐藏
				let mask = wrap.previousElementSibling;
				let visible = mask && mask.style && mask.style.display !== "none" && wrap.className.indexOf("ivu-modal-hidden") == -1;
				if (!visible) return;
				// 仅处理标题为“提示”的弹窗
				let header = wrap.querySelector(".ivu-modal-header-inner");
				if (!header || header.textContent.trim() !== "提示") return;
				// 点击确定按钮
				let btn = wrap.querySelector(".button-box-preview .btn.ivu-btn.ivu-btn-primary") || wrap.querySelector(".ivu-modal-footer .ivu-btn-primary");
				if (!btn) return;
				console.log("检测到提示弹窗，点击确定按钮");
				btn.click();
				hit = true;
			});
			return hit;
		};
		closeAlertModalFn();
		// 监听弹窗显示/隐藏变化，出现即确认
		let observer = new MutationObserver(() => closeAlertModalFn());
		document.querySelectorAll(".v-transfer-dom").forEach(node => {
			observer.observe(node, { attributes: true, childList: true, subtree: true, attributeFilter: ["style", "class"] });
		});
		// 定时兜底检查
		setInterval(closeAlertModalFn, 3000);
	}

	// ---------- 3. 暂停后自动恢复播放（兼容两套播放器） ----------
	if (learningConfig.enableResume) {
		let resumePlayFn = () => {
			let video = getVideoFn();
			if (!video) { console.log("未找到视频元素"); return; }
			// 正在播放或已播放完则跳过
			if (!video.paused) return;
			if (video.ended || (video.duration && video.currentTime >= video.duration - 0.5)) {
				console.log("本集已播放完，等待连续播放自动切换");
				return;
			}
			// 依次尝试点击播放按钮
			let playBtnList = [
				document.querySelector(".prism-big-play-btn"),        // Aliplayer 大播放按钮
				document.querySelector(".prism-play-btn"),             // Aliplayer 控制栏播放按钮
				document.querySelector(".bigplaybtn.j-bigplaybtn"),    // 旧播放器大播放按钮
				document.querySelector(".u-edu-h5player .j-playbtn")   // 旧播放器控制栏播放按钮
			];
			let clicked = false;
			playBtnList.forEach(btn => {
				if (btn && !clicked) {
					console.log("点击播放按钮恢复播放");
					btn.click();
					clicked = true;
				}
			});
			if (!clicked) {
				console.log("未找到播放按钮，直接调用 video.play()");
				video.play().catch(e => console.log("直接播放失败", e));
			}
			// 1 秒后仍未恢复则强制播放
			setTimeout(() => {
				if (video.paused && !video.ended) {
					console.log("按钮点击未生效，强制 video.play()");
					video.play().catch(e => console.log("强制播放失败", e));
				}
			}, 1000);
		};
		let video = getVideoFn();
		if (video) {
			video.addEventListener("pause", () => { console.log("检测到暂停，准备自动恢复"); setTimeout(resumePlayFn, 500); });
			video.addEventListener("ended", () => console.log("本集播放结束"));
			video.addEventListener("play", () => console.log("开始播放"));
		}
		// 定时兜底：每 5 秒检查一次
		setInterval(() => {
			let v = getVideoFn();
			if (v && v.paused && !v.ended) {
				console.log("轮询发现暂停，尝试恢复播放");
				resumePlayFn();
			}
		}, 5000);
	}

	// ---------- 4. 自动倍速（开启时立即执行一次，之后每 30 分钟检测一次） ----------
	setSpeedFn();
	if (learningConfig.enableSpeed) {
		setInterval(setSpeedFn, 1000 * 60 * 30);
	}
}

// 自动设置目标倍速（兼容两套播放器：优先点击倍速列表，找不到匹配项则直接设置）
function setSpeedFn() {
	if (!learningConfig.enableSpeed) return;
	const target = learningConfig.speed;
	if (!(target > 0)) { console.log("倍速配置无效:", target); return; }
	const video = getVideoFn();
	if (video && Math.abs((video.playbackRate || 1) - target) < 0.01) {
		console.log("当前已是目标倍速", target);
		return;
	}
	// Aliplayer 倍速设置入口
	const aliSettingBtn = document.querySelector(".prism-controlbar .prism-setting-btn");
	const aliSpeedContent = document.querySelector(".prism-setting-list .prism-setting-item.prism-setting-speed .setting-content");
	const aliSpeedList = document.querySelector(".prism-speed-selector.prism-setting-selector > ul.selector-list");
	// 旧播放器倍速入口
	const oldRateBtn = document.querySelector(".m-controlbar .j-ratebtn");
	const oldRateList = document.querySelector(".m-popover.m-popover-rate > ul");
	// 在倍速列表中寻找目标倍速项并点击
	const clickSpeedItem = list => {
		if (!list) return false;
		const items = Array.from(list.querySelectorAll("li"));
		const match = items.find(li => {
			const txt = (li.textContent || "").trim().toLowerCase().replace(/[x倍速\s]/g, "");
			const num = parseFloat(txt);
			return !isNaN(num) && Math.abs(num - target) < 0.01;
		});
		if (match) { console.log("点击倍速项", target, match); match.click(); return true; }
		console.log("未找到匹配的倍速项，可用项：", items.map(i => i.textContent.trim()));
		return false;
	};
	// 点击倍速项后校验是否生效，未生效则直接设置
	const ensureSpeed = () => {
		if (!video) return;
		setTimeout(() => {
			if (Math.abs((video.playbackRate || 1) - target) >= 0.01) {
				console.log("点击倍速项后未生效，直接设置 playbackRate");
				video.playbackRate = target;
			} else {
				console.log("倍速设置已生效", video.playbackRate);
			}
		}, 1500);
	};
	// 找不到倍速入口/匹配项时的兜底
	const fallbackSet = () => {
		if (video) {
			console.log("直接设置 playbackRate");
			video.playbackRate = target;
		}
	};
	if (aliSettingBtn && aliSpeedContent) {
		console.log("打开设置弹框");
		aliSettingBtn.click();
		setTimeout(() => {
			console.log("打开倍速列表");
			aliSpeedContent.click();
			setTimeout(() => {
				if (clickSpeedItem(aliSpeedList)) ensureSpeed();
				else fallbackSet();
			}, 1500);
		}, 800);
	} else if (oldRateBtn) {
		console.log("打开旧播放器倍速列表");
		oldRateBtn.click();
		setTimeout(() => {
			if (clickSpeedItem(oldRateList)) ensureSpeed();
			else fallbackSet();
		}, 800);
	} else if (video) {
		console.log("未找到倍速设置入口，直接设置 playbackRate");
		video.playbackRate = target;
	}
}

// 配置变更时立即应用倍速
function applySpeedNow() {
	if (!learningConfig.enableSpeed) return;
	const video = getVideoFn();
	if (video && learningConfig.speed > 0) {
		console.log("应用倍速", learningConfig.speed);
		video.playbackRate = learningConfig.speed;
	}
}

// 在内容脚本中监听来自popup/background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("监听来自popup/background的消息", request, sender);
	if (sender.id !== chrome.runtime.id) return; // 确保来自本扩展

	/**
	 * 数据处理
	 */
	if (request.action === "getAnswers") {
		getDataFn();
		// 返回结果
		sendResponse({ success: true, message: "已开启答案获取功能" });
	} else if (request.action === "autLearning") {
		// 合并最新配置后开启自动学习
		if (request.config) learningConfig = { ...learningConfig, ...request.config };
		AutLearningFn();
		// 返回结果
		sendResponse({ success: true, message: "已开启自动学习功能" });
	} else if (request.action === "updateConfig") {
		// 配置热更新：合并配置并立即应用倍速
		if (request.config) learningConfig = { ...learningConfig, ...request.config };
		applySpeedNow();
		sendResponse({ success: true, message: "配置已更新" });
	}

	return true; // 保持通道开放（异步响应需返回true）
});

// 传递消息到popup
setTimeout(() => {
	console.log("发送信息到popup");
	chrome.runtime.sendMessage({ event: "domChanged", data: "变化内容" });
}, 5000);
