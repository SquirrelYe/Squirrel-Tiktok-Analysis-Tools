// ==UserScript==
// @name         抓取抖音直播场次数据（Tampermonkey版）
// @namespace    http://tampermonkey.net/
// @version      0.1
// @run-at       document-start
// @description  抓取指定DOM内容并生成数据统计文档
// @author       风继续吹
// @match        union.bytedance.com/open/portal/anchor/list/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  console.log("Douyin Replay Scraper is running");

  // ------------------------------ 全局枚举值 ------------------------------

  const TabMap = {
    PK: "Tab_PK",
    AudienceAll: "Tab_AudienceAll",
    NewAudience: "Tab_NewAudience",
    Guest: "Tab_Guest",
  };

  // ------------------------------ 初始化 ------------------------------

  // 直播场次数据区域的选择器
  const containerID = "x-replays-container";
  const elReplayContainer = "#root > div > div.mb-4.flex.gap-4 > div.w-\\[400px\\].grow > div.mb-4.rounded-medium.p-4.\\!mb-0.bg-white"; // prettier-ignore
  const elReplayReplays = "#root > div > div.rightRrea--ZptAM > div.data--TrDAb.live--uU0CY > div > div.replays--PVDvg > section > div:nth-child(1) > div > div"; // prettier-ignore

  // 直播场次数据的Tab选择器
  const elReplayTabPk = "#semiTabpk"; // PK榜
  const elReplayTabAudienceAll = "#semiTabaudienceAll"; // 观众总榜
  const elReplayTabNewAudience = "#semiTabnewAudience"; // 新付费观众榜
  const elReplayTabGuest = "#semiTabguest"; // 连线嘉宾榜

  // 每页获取的直播场次数据条数
  const pageSizeAudienceAll = 100;

  // 直播场次数据的请求URL
  const urlTabPk = "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/faction/room_analysis/pk_data"; // prettier-ignore
  const urlTabAudienceAll = "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/anchor/live/room_rank_with_filter"; // prettier-ignore
  const urlTabNewAudience = "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/room/detail/new_pay_rank"; // prettier-ignore
  const urlTabGuest = "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/anchor/live/room_rank_with_filter"; // prettier-ignore

  var replays = [];
  var replayMap = {};

  // ------------------------------ 定时器 ------------------------------

  var timerExportReplays = null;
  var timerAppendTime = null;
  var timerCheckDom = null;

  // 运行状态
  var status = "Stopped"; // Stopped, Running, Paused
  var startTime = null;

  // 运行状态相关的DOM元素
  const statusText = document.createElement("p");
  const startTimeText = document.createElement("p");
  const replayScrapedTime = document.createElement("p");
  const replayLengthText = document.createElement("p");
  const replayPlayersText = document.createElement("p");
  const logContainer = document.createElement("pre"); // prettier-ignore

  // ------------------------------ 核心操作 ------------------------------

  // 设置运行状态文本
  const setText = (type, text) => {
    switch (type) {
      case "status":
        statusText.innerText = `运行状态: ${text}`;
        break;
      case "startTime":
        startTimeText.innerText = `开始时间: ${text || "-"}`;
        break;
      case "replayScrapedTime":
        replayScrapedTime.innerText = `导出回复时间: ${text || "-"}`;
        break;
      case "replayLength":
        replayLengthText.innerText = `记录回复条数: ${text}`;
        break;
      case "replayPlayers":
        replayPlayersText.innerText = `参与直播场次数据的用户: ${text}`;
        break;
      default:
        break;
    }
  };

  // 设置执行状态文本
  const setOperationLog = (text) => {
    logContainer.innerText += `${new Date().toLocaleTimeString()} - ${text}\n`;
    logContainer.scrollTop = logContainer.scrollHeight; // 滚动到底部
  };

  // 等待操作
  const wait = (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };

  // 导出直播场次数据
  const exportReplays = () => {
    var replaysSection = document.querySelector(elReplayReplays);
    var replaysText = (replaysSection && replaysSection.innerText) || "";

    const lines = replaysText.split("\n");

    // 如果第一行是“系统消息”开头，则删除
    if (lines[0].startsWith("系统消息")) {
      lines.shift();
    }

    // 遍历每两行，将其添加到cmts数组中，仅保存不一样的直播场次数据
    const nowStr = new Date().toLocaleString();
    const nowStrWithoutSeconds = new Date().toLocaleString().slice(0, -3);

    console.log(`[${nowStr}] 导出回复，目前总数: ${replays.length}`, "玩家数:", Object.keys(replayMap).length); // prettier-ignore

    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        const user = lines[i];
        const content = lines[i + 1];

        // 将每个人的直播场次数据保存到replayMap中
        const item = `${nowStrWithoutSeconds} -> ${content}`;
        if (replayMap[user]) {
          const arr = replayMap[user];
          if (!arr.filter((x) => x.includes(`-> ${content}`)).length) {
            arr.push(item);
          }
        } else {
          replayMap[user] = [item];
        }

        // 将直播场次数据保存到replays数组中
        const txt = `- @${user} -> ${content}\n`;
        if (!replays.includes(txt)) {
          replays.push(txt);
        }
      }
    }

    setText("replayScrapedTime", nowStr);
    setText("replayLength", replays.length);
    setText("replayPlayers", Object.keys(replayMap).length);
  };

  // 下载直播场次数据
  const downloadReplays = async () => {
    // 创建一个Blob对象
    const text = replays.join("");
    const textMap = Object.keys(replayMap)
      .map((key) => `### ${key}\n${replayMap[key].join("\n")}\n`)
      .join("\n");

    // 数据统计
    const fuserStatisticsSorted = Object.keys(replayMap);
    const fuserStatisticsReplays = Object.keys(replayMap)
      .map((key) => {
        const list = replayMap[key] || [];
        return {
          user: key,
          count: list.length,
          time: `${list[0].split("->")[0].trim()} - ${list.length > 1 ? list[list.length - 1].split("->")[0].trim() : 'N/A'}`, // prettier-ignore
        };
      })
      .sort((a, b) => b.count - a.count) // prettier-ignore
      .map((x) => `@${x.user} , 直播场次数据数量：${x.count} , 直播场次数据开始、结尾时间：${x.time}`) // prettier-ignore
      .join("\n"); // prettier-ignore
    const fuserStatistics = `### 用户直播场次数据时间排序\n${fuserStatisticsReplays}\n\n### 用户直播场次数据数量排序\n${fuserStatisticsSorted.join("\n")}`; // prettier-ignore

    console.log(text.length);
    console.log(Object.keys(replayMap), textMap);

    // 使用startTime判断是上午还是下午
    const isMorning = new Date(startTime).getHours() < 12;
    const timeStr = isMorning ? "上午" : "下午";

    // 20241121直播数据导出（上午）
    const time = new Date().getFullYear() + "" + (new Date().getMonth() + 1) + "" + new Date().getDate(); // prettier-ignore
    download(`${time}直播数据导出（${timeStr}）.md`, text);
    download(`${time}直播数据导出（观众，${timeStr}）.md`, textMap); // prettier-ignore
    download(`${time}直播数据导出（观众直播场次数据统计，${timeStr}）.md`, fuserStatistics); // prettier-ignore

    console.log("Replays downloaded successfully");
  };

  // 下载逻辑
  const download = (filename, text) => {
    console.log("Downloading replays, ", filename, text.length);
    var link = document.createElement("a");
    var blob = new Blob([text], { type: "text/plain" });
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("Downloaded successfully");
  };

  // 收集请求数据
  const collectRequests = async () => {
    // 切换到标签
    const changeTab = (tab) => {
      const tabElement = document.querySelector(tab);
      setOperationLog(`寻找标签定位元素: ${tab}`);
      if (tabElement) {
        tabElement.click();
        setOperationLog(`成功切换到标签: ${tab}`);
      } else {
        console.error(`未找到标签元素: ${tab}`);
        setOperationLog(`未找到标签元素: ${tab}`);
      }
    };

    setOperationLog("开始收集请求数据，请稍等...");

    changeTab(elReplayTabPk);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabAudienceAll);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabNewAudience);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabGuest);
    await wait(2000); // 等待2秒钟以确保切换完成

    changeTab(elReplayTabPk);
    await wait(2000); // 等待2秒钟以确保切换完成
  };

  // ❶ 采集 - PK榜
  const startExportPK = async () => {
    const storedRequestMap = GM_getValue("xhrRequests", {});
    const storedResponseMap = GM_getValue("xhrResponses", {});
    console.log("Stored requests:", storedRequestMap);
    console.log("Stored responses:", storedResponseMap);

    setOperationLog("开始导出PK榜数据，请稍等...");

    // 如果已经在运行，则不执行
    if (status === "Running") {
      alert("已经在运行中");
      setOperationLog("导出PK榜数据失败，已经在运行中");
      return;
    }

    if (confirm("确定要开始当前直播场次的PK榜数据吗？")) {
      if (!storedRequestMap[TabMap.PK]) {
        setOperationLog("未捕获到PK榜请求，请先进行收集请求数据操作");
        alert("未捕获到PK榜请求，请先进行收集请求数据操作");
        return;
      }

      // 回放请求
      setOperationLog("开始回放PK榜请求");
      const rsp = await replayRequest(storedRequestMap[TabMap.PK]);
      console.log("开始回放PK榜请求 Rsp:", rsp);

      const responseData = JSON.parse(rsp.body)["data"] || {};
      const pkData = JSON.parse(responseData["data_string"]) || {};
      if (!pkData) {
        setOperationLog("未捕获到PK榜数据");
        return;
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到PK榜数据，已存储到本地存储，数据内容: ${JSON.stringify(pkData)}`); // prettier-ignore
      storedResponseMap[TabMap.PK] = pkData;
      GM_setValue("xhrResponses", storedResponseMap);

      setOperationLog("PK榜数据采集成功");
      alert("PK榜数据采集成功，请查看控制台输出");
    }
  };

  // ❷ 采集 - 观众总榜
  const startExportAudienceAll = async () => {
    const storedRequestMap = GM_getValue("xhrRequests", {});
    const storedResponseMap = GM_getValue("xhrResponses", {});
    console.log("Stored requests:", storedRequestMap);
    console.log("Stored responses:", storedResponseMap);

    setOperationLog("开始导出观众总榜数据，请稍等...");

    // 如果已经在运行，则不执行
    if (status === "Running") {
      alert("已经在运行中");
      setOperationLog("导出观众总榜数据失败，已经在运行中");
      return;
    }

    if (confirm("确定要开始当前直播场次的观众总榜数据吗？")) {
      if (!storedRequestMap[TabMap.AudienceAll]) {
        setOperationLog("未捕获到观众总榜请求，请先进行收集请求数据操作");
        alert("未捕获到观众总榜请求，请先进行收集请求数据操作");
        return;
      }

      // 回放请求
      setOperationLog("开始回放观众总榜请求");
      const requestBase = storedRequestMap[TabMap.AudienceAll];

      // 发起回放请求
      const rsp = await replayRequest(requestBase);
      const responseData = JSON.parse(rsp.body)["data"] || {};
      const audienceAllData = JSON.parse(responseData["data_string"]) || {};
      if (!audienceAllData) {
        setOperationLog("未捕获到观众总榜数据");
        return;
      }

      // 检查并获取总数
      if (audienceAllData.code !== 0) {
        setOperationLog("未捕获到观众总榜数据");
        alert("未捕获到观众总榜数据，请检查控制台输出");
        return;
      } else {
        const { total } = audienceAllData.data || {};
        setOperationLog(`捕获到观众总榜数据，总数: ${total}`);
      }

      // 将总数据分次拉取
      const total = audienceAllData.data.total || 0;
      const pageSize = pageSizeAudienceAll; // 每页获取的条数
      const pageCount = Math.ceil(total / pageSize); // 总页数
      setOperationLog(`观众总榜数据总数: ${total}，即将进行分页拉取，每页获取条数: ${pageSize}，总页数: ${pageCount}`); // prettier-ignore

      // 分页拉取数据
      const responseList = [];
      for (let page = 1; page <= pageCount; page++) {
        setOperationLog(`正在拉取观众总榜数据，第 ${page} / ${pageCount} 次拉取...`); // prettier-ignore

        // 修改requestBase中的url字段的&page=1&size=5字段信息
        const url = new URL(requestBase.url);
        url.searchParams.set("page", page);
        url.searchParams.set("size", pageSize);
        requestBase.url = url.toString();

        // 执行回放请求
        const pageRsp = await replayRequest(requestBase); // prettier-ignore
        const responseData = JSON.parse(pageRsp.body)["data"] || {};
        const audienceAllData = JSON.parse(responseData["data_string"])['data']['series'] || []; // prettier-ignore

        setOperationLog(`第 ${page} / ${pageCount} 次拉取成功，获取到观众总榜数据条数: ${audienceAllData.length}`); // prettier-ignore

        responseList.push(...audienceAllData);
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到观众总榜数据，已存储到本地存储，数据内容: ${JSON.stringify(responseList)}`); // prettier-ignore
      storedResponseMap[TabMap.AudienceAll] = responseList;
      GM_setValue("xhrResponses", storedResponseMap);

      setOperationLog("观众总榜数据采集成功");
      alert("观众总榜数据采集成功，请查看控制台输出");
    }
  };

  //  ❸ 采集 - 新观众付费榜
  const startExportNewAudience = async () => {
    const storedRequestMap = GM_getValue("xhrRequests", {});
    const storedResponseMap = GM_getValue("xhrResponses", {});
    console.log("Stored requests:", storedRequestMap);
    console.log("Stored responses:", storedResponseMap);

    setOperationLog("开始导出新观众付费榜数据，请稍等...");

    // 如果已经在运行，则不执行
    if (status === "Running") {
      alert("已经在运行中");
      setOperationLog("导出新观众付费榜数据失败，已经在运行中");
      return;
    }

    if (confirm("确定要开始当前直播场次的新观众付费榜数据吗？")) {
      if (!storedRequestMap[TabMap.NewAudience]) {
        setOperationLog("未捕获到新观众付费榜请求，请先进行收集请求数据操作");
        alert("未捕获到新观众付费榜请求，请先进行收集请求数据操作");
        return;
      }

      // 回放请求
      setOperationLog("开始回放新观众付费榜请求");
      const requestBase = storedRequestMap[TabMap.NewAudience];

      // 发起回放请求
      const rsp = await replayRequest(requestBase);
      const responseData = JSON.parse(rsp.body)["data"] || {};
      const newAudienceData = JSON.parse(responseData["data_string"]) || {};
      if (!newAudienceData) {
        setOperationLog("未捕获到新观众付费榜数据");
        return;
      }

      // 检查并获取总数
      if (newAudienceData.code !== 0) {
        setOperationLog("未捕获到新观众付费榜数据");
        alert("未捕获到新观众付费榜数据，请检查控制台输出");
        return;
      } else {
        const { total } = newAudienceData.data || {};
        setOperationLog(`捕获到新观众付费榜数据，总数: ${total}`);
      }

      // 将总数据分次拉取
      const total = newAudienceData.data.total || 0;
      const pageSize = pageSizeAudienceAll; // 每页获取的条数
      const pageCount = Math.ceil(total / pageSize); // 总页数
      setOperationLog(`新观众付费榜数据总数: ${total}，即将进行分页拉取，每页获取条数: ${pageSize}，总页数: ${pageCount}`); // prettier-ignore

      // 分页拉取数据
      const responseList = [];
      for (let page = 1; page <= pageCount; page++) {
        setOperationLog(`正在拉取新观众付费榜数据，第 ${page} / ${pageCount} 次拉取...`); // prettier-ignore

        // 修改requestBase中的url字段的offset=1&limit=5字段信息
        const url = new URL(requestBase.url);
        url.searchParams.set("offset", page);
        url.searchParams.set("limit", pageSize);
        requestBase.url = url.toString();

        // 执行回放请求
        const pageRsp = await replayRequest(requestBase); // prettier-ignore
        const responseData = JSON.parse(pageRsp.body)["data"] || {};
        const newAudienceData = JSON.parse(responseData["data_string"])['data']['series'] || []; // prettier-ignore

        setOperationLog(`第 ${page} / ${pageCount} 次拉取成功，获取到新观众付费榜数据条数: ${newAudienceData.length}`); // prettier-ignore

        responseList.push(...newAudienceData);
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到新观众付费榜数据，已存储到本地存储，数据内容: ${JSON.stringify(responseList)}`); // prettier-ignore
      storedResponseMap[TabMap.NewAudience] = responseList;
      GM_setValue("xhrResponses", storedResponseMap);

      setOperationLog("新观众付费榜数据采集成功");
      alert("新观众付费榜数据采集成功，请查看控制台输出");
    }
  };

  // ❹ 采集 - 连线嘉宾榜
  const startExportGuest = async () => {
    // 暂时不支持
    setOperationLog("连线嘉宾榜数据导出暂不支持");
    alert("连线嘉宾榜数据导出暂不支持");
    return;
  };

  // 暂停
  const pause = () => {
    if (confirm("确定要暂停吗？")) {
      status = "Paused";
      clearTimers();
      console.log("Paused scraping replays");

      setText("status", status);
    }
  };

  // 继续
  const resume = () => {
    status = "Running";
    start();
    console.log("Resumed scraping replays");

    setText("status", status);
  };

  // 停止
  const stop = () => {
    if (confirm("确定要停止吗？")) {
      clearTimers();
      console.log("Stopped scraping replays");

      status = "Stopped";
      setText("status", status);
    }
  };

  // 清理定时器
  const clearTimers = () => {
    try {
      clearInterval(timerExportReplays);
      clearInterval(timerAppendTime);
      console.log("Timers cleared");
    } catch (error) {
      console.log("clearTimers error:", error);
    }
  };

  //  ------------------------------ 请求操作 ------------------------------

  // 拦截XHR HTTP请求
  const interceptXHR = () => {
    console.log("Intercepting XMLHttpRequest");

    setOperationLog("初始化XHR拦截器");

    // 重写XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__url = url;
      this._method = method;
      this._requestHeaders = {};
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
      this._requestHeaders[header] = value;
      return originalSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const storedRequestMap = GM_getValue("xhrRequests", {});
      const storedResponseMap = GM_getValue("xhrResponses", {});

      let isFlagged = false;
      const requestData = {
        type: "",
        id: Date.now() + Math.random().toString(36).substr(2),
        url: this.__url,
        method: this._method,
        query: this.__url.split("?")[1] || "", // 获取URL中的查询参数
        body: body,
        headers: this._requestHeaders,
        cookies: document.cookie,
        timestamp: new Date().toISOString(),
      };

      // 检查请求的URL是否包含特定的Tab标识
      if (this.__url.includes(urlTabPk)) {
        isFlagged = true;
        requestData.type = TabMap.PK;
        setOperationLog(`拦截到请求：PK榜请求，${JSON.stringify(requestData)}`); // prettier-ignore
      } else if (this.__url.includes(urlTabAudienceAll)) {
        isFlagged = true;
        requestData.type = TabMap.AudienceAll;
        setOperationLog(`拦截到请求：观众总榜请求，${JSON.stringify(requestData)}`); // prettier-ignore
      } else if (this.__url.includes(urlTabNewAudience)) {
        isFlagged = true;
        requestData.type = TabMap.NewAudience;
        setOperationLog(`拦截到请求：新观众付费榜请求，${JSON.stringify(requestData)}`); // prettier-ignore
      }
      // else if (__url.includes(urlTabGuest)) {
      //   isFlagged = true;
      //   requestData.type = TabMap.Guest;
      //   setOperationLog(`拦截到请求：连线嘉宾榜请求，${JSON.stringify(requestData)}`); // prettier-ignore
      // }

      // 如果是PK榜请求，则打印请求和响应
      if (isFlagged) {
        this.addEventListener("load", function () {
          console.log("XHR Response:", {
            url: this.__url,
            method: this._method,
            status: this.status,
            response: this.response,
            headers: this.getAllResponseHeaders(),
          });
          requestData.url = this.__url; // 更新URL
          // 打印请求的URL、方法、请求体、请求头等信息
          console.log("拦截到请求:", requestData);
          // 存储请求
          storedRequestMap[requestData.type] = requestData;
          GM_setValue("xhrRequests", storedRequestMap);
          setOperationLog(`存储请求数据：${requestData.type}，${JSON.stringify(Object.keys(storedRequestMap))}`); // prettier-ignore
        });
      }

      return originalSend.apply(this, arguments);
    };
  };

  // 发送回放请求
  const replayRequest = (request) => {
    setOperationLog(`开始回放请求: ${request.type}，${JSON.stringify(request)}`); // prettier-ignore
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: request.method,
        url: request.url, // URL中
        timeout: 10000, // 设置超时时间为10秒
        headers: request.headers,
        data: request.body,
        onload: function (response) {
          // 响应数据在response.responseText中，如果是二进制数据，可能需要使用response.response
          resolve({
            status: response.status,
            statusText: response.statusText,
            headers: response.responseHeaders,
            body: response.responseText,
            response: response, // 完整的响应对象
          });
        },
        onerror: function (error) {
          setOperationLog(`回放请求失败: ${request.type}，错误信息: ${error.message}`); // prettier-ignore
          reject(error);
        },
        ontimeout: function () {
          setOperationLog(`回放请求超时: ${request.type}`); // prettier-ignore
          reject(new Error("Request timed out"));
        },
      });
    });
  };

  // ------------------------------ 页面操作 ------------------------------

  // 封装一个创建按钮的函数
  const createButton = (text, onClick) => {
    const button = document.createElement("button");
    button.innerText = text;
    button.style = "padding: 10px; margin: 10px; font-size: 16px; width: 200px;"; // prettier-ignore
    button.onclick = onClick;
    return button;
  };

  // 清理containerID关联的DOM
  const clearDisplay = () => {
    setOperationLog(`清理根渲染容器: ${containerID}`);
    const container = document.querySelector(`#${containerID}`);
    if (container) {
      container.remove();
    }
    setOperationLog(`清理根渲染容器完成: ${containerID}`);
  };

  // 在页面上添加按钮
  const createDisplay = () => {
    setOperationLog("创建操作区域");

    const containerReplay = document.querySelector(elReplayContainer);
    console.log("current container:", containerReplay);

    // ################################### 操作区域 ###################################

    const operationContainer = document.createElement("div"); // prettier-ignore
    const operationLeft = document.createElement("div"); // prettier-ignore
    const operationRight = document.createElement("div"); // prettier-ignore

    operationContainer.id = containerID;
    operationContainer.style.height = "500px"; // prettier-ignore
    operationContainer.style.position = "fixed"; // prettier-ignore
    operationContainer.style.bottom = "50px"; // prettier-ignore
    operationContainer.style.right = "50px"; // prettier-ignore
    operationContainer.style.width = "800px"; // prettier-ignore
    operationContainer.style.zIndex = "9999"; // prettier-ignore
    operationContainer.style.display = "flex"; // prettier-ignore
    operationContainer.style.flexDirection = "row"; // prettier-ignore
    operationContainer.style.backgroundColor = "rgba(255, 255, 255, 0.8)"; // prettier-ignore
    operationContainer.style.padding = "30px"; // prettier-ignore
    operationContainer.style.borderRadius = "10px"; // prettier-ignore
    operationContainer.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)"; // prettier-ignore
    operationContainer.style.visibility = "visible"; // prettier-ignore

    operationLeft.style = "width: 300px;"; // prettier-ignore
    operationRight.style = "width: calc(100% - 300px); flex: 1; display: flex; flex-direction: column; align-items: center;"; // prettier-ignore

    // ----- 创建操作按钮 -----

    const collectButton = createButton("☃执行请求采集捕获程序", collectRequests); // prettier-ignore
    const exportPkButton = createButton("⛐采集 - PK榜", startExportPK); // prettier-ignore
    const exportAudienceAllButton = createButton("⛐采集 - 观众总榜", startExportAudienceAll); // prettier-ignore
    const exportNewAudienceButton = createButton("⛐采集 - 新观众付费榜", startExportNewAudience); // prettier-ignore
    const exportGuestButton = createButton("⛐采集 - 连线嘉宾榜", startExportGuest); // prettier-ignore
    const downloadButton = createButton("⎋下载直播场次数据", downloadReplays); // prettier-ignore

    collectButton.style = "background-color: #008CBA; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportPkButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportAudienceAllButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportNewAudienceButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportGuestButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    downloadButton.style = "background-color: #008CBA; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore

    // exportAudienceAllButton.style = "background-color: #E6A23C; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    // resumeButton.style = "background-color: #909399; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    // stopButton.style = "background-color: #f44336; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore

    operationLeft.appendChild(collectButton);
    operationLeft.appendChild(exportPkButton);
    operationLeft.appendChild(exportAudienceAllButton);
    operationLeft.appendChild(exportNewAudienceButton);
    operationLeft.appendChild(exportGuestButton);
    operationLeft.appendChild(downloadButton);

    // operationLeft.appendChild(resumeButton);
    // operationLeft.appendChild(stopButton);

    // ----- 创建状态文本 -----

    setText("status", status);
    setText("startTime", startTime);
    setText("replayScrapedTime", "-");
    setText("replayLength", replays.length);
    setText("replayPlayers", Object.keys(replayMap).length);

    statusText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px; width: 300px;"; // prettier-ignore
    startTimeText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px; width: 300px;"; // prettier-ignore
    replayScrapedTime.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px; width: 300px;"; // prettier-ignore
    replayLengthText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px; width: 300px;"; // prettier-ignore
    replayPlayersText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px; width: 300px;"; // prettier-ignore

    operationLeft.appendChild(statusText);
    operationLeft.appendChild(startTimeText);
    operationLeft.appendChild(replayScrapedTime);
    operationLeft.appendChild(replayLengthText);
    operationLeft.appendChild(replayPlayersText);

    // ---- 创建日志区域 -----

    logContainer.id = "x-log-container";
    logContainer.style = "margin: 0 0 0 20px; width: 100%; height: 100%; padding: 10px; font-size: 14px; background-color: #f0f0f0; border-radius: 5px; overflow-y: auto;"; // prettier-ignore
    logContainer.innerText = "日志区域：\n";

    operationRight.appendChild(logContainer);

    //  ################################### 将操作区域添加到页面 ##################################

    operationContainer.appendChild(operationLeft);
    operationContainer.appendChild(operationRight);
    containerReplay.appendChild(operationContainer);

    // ################################### 控制显示区域 ##################################

    const showContainer = document.createElement("div"); // prettier-ignore

    const showButton = createButton("+显示操作区域", () => operationContainer.style.visibility = "visible"); // prettier-ignore
    const hideButton = createButton("-隐藏操作区域", () => operationContainer.style.visibility = "hidden"); // prettier-ignore

    //  设置显示和隐藏按钮的样式
    showContainer.style.position = "fixed"; // prettier-ignore
    showContainer.style.bottom = "550px"; // prettier-ignore
    showContainer.style.right = "50px"; // prettier-ignore
    showContainer.style.zIndex = "9999"; // prettier-ignore
    showContainer.style.display = "flex"; // prettier-ignore
    showContainer.style.backgroundColor = "rgba(255, 255, 255, 0.8)"; // prettier-ignore
    showContainer.style.padding = "10px"; // prettier-ignore
    showContainer.style.borderRadius = "10px"; // prettier-ignore
    showContainer.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)"; // prettier-ignore
    showContainer.style.visibility = "visible"; // prettier-ignore

    showButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; font-size: 16px; cursor: pointer"; // prettier-ignore
    hideButton.style = "background-color: #f44336; color: white; margin-top: 5px; font-size: 16px; cursor: pointer"; // prettier-ignore

    showContainer.appendChild(showButton);
    showContainer.appendChild(hideButton);

    containerReplay.appendChild(showContainer);

    setOperationLog("操作区域创建完成");
  };

  // ------------------------------ 入口函数 ------------------------------

  // 清理缓存
  const clearCache = () => {
    setOperationLog("清理缓存...");
    GM_setValue("xhrRequests", {});
    GM_setValue("xhrResponses", {});
    replays = [];
    replayMap = {};
    localStorage.removeItem("x-replays");
    localStorage.removeItem("x-replays-player-map");
    setOperationLog("缓存清理完成");
  };

  // 主函数
  const main = () => {
    try {
      interceptXHR();
      // clearCache();
      clearDisplay();
      createDisplay();
    } catch (error) {
      setOperationLog(`主函数执行出错: ${error.message}`);
    }
  };

  // 执行主函数
  timerCheckDom = setInterval(() => {
    setOperationLog("检查DOM是否加载完成...");
    // 检查 elReplayContainer 是否存在
    if (document.querySelector(elReplayContainer)) {
      setOperationLog("DOM已加载，开始执行主函数");
      // 页面滚动到 elReplayContainer 的位置
      setTimeout(() => {
        setOperationLog("DOM已加载，执行页面滚动");
        document.querySelector(elReplayContainer).scrollIntoView();
      }, 2000);
      main();
      setOperationLog("DOM已经加载，开始执行主函数");
      clearInterval(timerCheckDom);
    } else {
      setOperationLog("DOM未加载，继续等待");
    }
  }, 500);
})();
