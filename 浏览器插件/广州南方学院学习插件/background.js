// background.js

// 动态修改图标事件
function setIconFn(tab) {
	try {
		console.log("修改图标");
		const canvas = new OffscreenCanvas(16, 16);
		const ctx = canvas.getContext("2d");
		// 清除画布
		ctx.clearRect(0, 0, 16, 16);
		// 绘制不同颜色的圆形
		ctx.fillStyle = "#999";
		ctx.beginPath();
		ctx.arc(8, 8, 8, 0, Math.PI * 2);
		ctx.fill();
		// 动态设置图标
		chrome.action.setIcon({
			imageData: ctx.getImageData(0, 0, 16, 16),
			tabId: tab.id
		});
		console.log("图标修改成功");
		return true;
	} catch (error) {
		console.log("图标修改失败", error);
		return false;
	}
}

// 判断当前页面是否可用此插件
function isAvailableFn(tab) {
	const url = tab.url;
	// 可用网站
	const allowedDomains = ["edu-edu.com"];

	// 当前页面是否为可用页面
	let isOk = allowedDomains.some(domain => url.indexOf(domain) != -1);

	console.log("isOk ==>", isOk);
	return isOk;
}

// 插件安装完成监听
chrome.runtime.onInstalled.addListener(() => {
	console.log("插件已被安装", chrome);

	// ​​chrome.tabs.onActivated​​ - 当用户切换到不同标签页时触发
	// ​​chrome.tabs.onUpdated​​ - 当标签页状态更新时（如URL变化、加载状态变化）
	// ​​chrome.tabs.onCreated​​ - 当新标签页被创建时
	// ​​chrome.tabs.onRemoved​​ - 当标签页被关闭时
	// ​​chrome.tabs.onReplaced​​ - 当标签页被替换时（如预渲染）

	// 用户切换到不同标签页时	最直接的标签页切换监听
	chrome.tabs.onActivated.addListener(async activeInfo => {
		const { tabId, windowId } = activeInfo;
		try {
			// 获取新切换的标签页详细信息
			const tab = await chrome.tabs.get(tabId);

			console.log("切换到标签页:", { url: tab.url, title: tab.title, tabId, windowId });

			if (!isAvailableFn(tab)) {
				// 禁用图标
				setIconFn(tab);
			}
		} catch (error) {
			console.error("获取标签页信息失败:", error);
		}
	});
	// 标签页状态更新时（URL变化、标题变化等）	可监听页面内容和状态变化
	chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
		// 仅处理活动标签页
		if (!tab.active) return;

		// URL发生变化时触发
		if (changeInfo.url) {
			console.log(`URL变化: ${changeInfo.url} → ${tab.url}`);
			if (!isAvailableFn(tab)) {
				// 禁用图标
				setIconFn(tab);
			}
		}

		// 页面标题更新时
		if (changeInfo.title) {
			console.log(`标题变为: ${changeInfo.title}`);
		}

		// 页面加载状态变化
		if (changeInfo.status) {
			console.log(`状态变化: ${changeInfo.status}`);

			// 页面加载完成
			if (changeInfo.status === "complete") {
				console.log(`页面加载完成: ${changeInfo.status}`);
			}
		}
	});

	// 用户切换到不同浏览器窗口时	窗口级别的切换监听
	chrome.windows.onFocusChanged.addListener(async windowId => {
		if (windowId === chrome.windows.WINDOW_ID_NONE) {
			console.log("所有窗口都失去焦点");
			return;
		}

		try {
			// 获取当前聚焦窗口的活动标签页
			const window = await chrome.windows.get(windowId, { populate: true });
			const activeTab = window.tabs.find(tab => tab.active);

			if (activeTab) {
				console.log("切换到窗口:", windowId, "标签页:", activeTab.url);
			}
		} catch (error) {
			console.error("获取窗口信息失败:", error);
		}
	});

	// 标签页组被高亮选中时	批量标签页切换监听
	chrome.tabs.onHighlighted.addListener(highlightInfo => {
		console.log("高亮标签页变化:", highlightInfo);

		// highlightInfo 结构:
		//   windowId: 高亮事件发生的窗口ID
		//   tabIds: 当前被高亮选择的标签页ID数组

		// 获取高亮标签页的详细信息
		chrome.tabs.query({ windowId: highlightInfo.windowId }, allTabs => {
			// 筛选出高亮标签页
			const highlightedTabs = allTabs.filter(tab => highlightInfo.tabIds.includes(tab.id));

			console.log("高亮标签页详情:", highlightedTabs);
		});
	});

	// 监听各个页面发送过来的消息
	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
		// 安全验证,防止外部脚本
		if (sender.id !== chrome.runtime.id) return;
		if (request.type === "isAvailable") {
			let isOk = isAvailableFn(request.tab);
			sendResponse({ data: isOk }); // 回传结果
		} else if (request.type === "setIcon") {
			setIconFn(request.tab);
			sendResponse({ data: isAvailableFn(request.tab) }); // 回传结果
		}
		return true; // 保持通道开放等待异步响应
	});
});
