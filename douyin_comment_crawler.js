// ==UserScript==
// @name         抓取抖音直播评论（Tampermonkey版）
// @namespace    http://tampermonkey.net/
// @version      0.1
// @run-at       document-idle
// @description  抓取指定DOM内容并生成文本文档
// @author       风继续吹
// @match        https://anchor.douyin.com/*
// ==/UserScript==

(function () {
  "use strict";

  console.log("Douyin Comments Scraper is running");

  // 评论区域的选择器
  const containerID = "x-comments-container";
  const elCommentContainer = "#root > div > div.rightRrea--ZptAM > div.data--TrDAb.live--uU0CY > div"; // prettier-ignore
  const elCommentComments = "#root > div > div.rightRrea--ZptAM > div.data--TrDAb.live--uU0CY > div > div.comments--PVDvg > section > div:nth-child(1) > div > div"; // prettier-ignore

  var comments = [];
  var commentMap = {};
  var timerExportComments = null;
  var timerAppendTime = null;
  var timerCheckDom = null;

  var status = "Stopped"; // Stopped, Running, Paused
  var startTime = null;

  const statusText = document.createElement("p");
  const startTimeText = document.createElement("p");
  const commentScrapedTime = document.createElement("p");
  const commentLengthText = document.createElement("p");
  const commentPlayersText = document.createElement("p");

  const setText = (type, text) => {
    switch (type) {
      case "status":
        statusText.innerText = `运行状态: ${text}`;
        break;
      case "startTime":
        startTimeText.innerText = `开始时间: ${text || "-"}`;
        break;
      case "commentScrapedTime":
        commentScrapedTime.innerText = `导出回复时间: ${text || "-"}`;
        break;
      case "commentLength":
        commentLengthText.innerText = `记录回复条数: ${text}`;
        break;
      case "commentPlayers":
        commentPlayersText.innerText = `参与评论的用户: ${text}`;
        break;
      default:
        break;
    }
  };

  // ------------------------------ 核心操作 ------------------------------

  // 导出评论
  const exportComments = () => {
    var commentsSection = document.querySelector(elCommentComments);
    var commentsText = (commentsSection && commentsSection.innerText) || "";

    const lines = commentsText.split("\n");

    // 如果第一行是“系统消息”开头，则删除
    if (lines[0].startsWith("系统消息")) {
      lines.shift();
    }

    // 遍历每两行，将其添加到cmts数组中，仅保存不一样的评论
    const nowStr = new Date().toLocaleString();
    const nowStrWithoutSeconds = new Date().toLocaleString().slice(0, -3);

    console.log(`[${nowStr}] 导出回复，目前总数: ${comments.length}`, "玩家数:", Object.keys(commentMap).length); // prettier-ignore

    for (let i = 0; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        const user = lines[i];
        const content = lines[i + 1];

        // 将每个人的评论保存到commentMap中
        const item = `${nowStrWithoutSeconds} -> ${content}`;
        if (commentMap[user]) {
          const arr = commentMap[user];
          if (!arr.filter((x) => x.includes(`-> ${content}`)).length) {
            arr.push(item);
          }
        } else {
          commentMap[user] = [item];
        }

        // 将评论保存到comments数组中
        const txt = `- @${user} -> ${content}\n`;
        if (!comments.includes(txt)) {
          comments.push(txt);
        }
      }
    }

    setText("commentScrapedTime", nowStr);
    setText("commentLength", comments.length);
    setText("commentPlayers", Object.keys(commentMap).length);
  };

  // 下载评论
  const downloadComments = () => {
    // 创建一个Blob对象
    const text = comments.join("");
    const textMap = Object.keys(commentMap)
      .map((key) => `### ${key}\n${commentMap[key].join("\n")}\n`)
      .join("\n");

    // 数据统计
    const fuserStatisticsSorted = Object.keys(commentMap);
    const fuserStatisticsComments = Object.keys(commentMap)
      .map((key) => {
        const list = commentMap[key] || [];
        return {
          user: key,
          count: list.length,
          time: `${list[0].split("->")[0].trim()} - ${list.length > 1 ? list[list.length - 1].split("->")[0].trim() : 'N/A'}`, // prettier-ignore
        };
      })
      .sort((a, b) => b.count - a.count) // prettier-ignore
      .map((x) => `@${x.user} , 评论数量：${x.count} , 评论开始、结尾时间：${x.time}`) // prettier-ignore
      .join("\n"); // prettier-ignore
    const fuserStatistics = `### 用户评论时间排序\n${fuserStatisticsComments}\n\n### 用户评论数量排序\n${fuserStatisticsSorted.join("\n")}`; // prettier-ignore

    console.log(text.length);
    console.log(Object.keys(commentMap), textMap);

    // 使用startTime判断是上午还是下午
    const isMorning = new Date(startTime).getHours() < 12;
    const timeStr = isMorning ? "上午" : "下午";

    // 20241121直播数据导出（上午）
    const time = new Date().getFullYear() + "" + (new Date().getMonth() + 1) + "" + new Date().getDate(); // prettier-ignore
    download(`${time}直播数据导出（${timeStr}）.md`, text);
    download(`${time}直播数据导出（观众，${timeStr}）.md`, textMap); // prettier-ignore
    download(`${time}直播数据导出（观众评论统计，${timeStr}）.md`, fuserStatistics); // prettier-ignore

    console.log("Comments downloaded successfully");
  };

  // 下载逻辑
  const download = (filename, text) => {
    console.log("Downloading comments, ", filename, text.length);
    var link = document.createElement("a");
    var blob = new Blob([text], { type: "text/plain" });
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("Downloaded successfully");
  };

  // 开始
  const start = () => {
    // 如果已经在运行，则不执行
    if (status === "Running") {
      alert("已经在运行中");
      return;
    }

    if (confirm("确定要开始监听评论吗？")) {
      clearTimers();

      status = "Running";
      startTime = new Date().toLocaleString();

      const storage = "x-comments";
      const storagePlayerMap = "x-comments-player-map";
      comments = JSON.parse(localStorage.getItem(storage)) || [];
      commentMap = JSON.parse(localStorage.getItem(storagePlayerMap)) || {};

      if (comments.length === 0) {
        const now = new Date();
        comments.push(`### ${now.toLocaleString()} \n`);
      }

      setText("status", status);
      setText("startTime", startTime);
      setText("commentLength", comments.length);
      setText("commentPlayers", Object.keys(commentMap).length);

      // 每15秒导出一次评论
      timerExportComments = setInterval(() => {
        exportComments();
        localStorage.setItem("x-comments", JSON.stringify(comments));
        localStorage.setItem("x-comments-player-map", JSON.stringify(commentMap)); // prettier-ignore
      }, 15 * 1000);

      // 每60秒将时间戳添加到评论中
      timerAppendTime = setInterval(() => {
        const now = new Date();
        comments.push(`### ${now.toLocaleString()} \n`);
      }, 60 * 1000);

      console.log(`[${startTime}] 启动监听评论成功，开始导出评论`);
    }
  };

  // 开始并清除之前的评论
  const startWithClear = () => {
    // 如果已经在运行，则不执行
    if (status === "Running") {
      alert("已经在运行中");
      return;
    }

    if (confirm("确定要清除之前的评论记录吗？")) {
      comments = [];
      commentMap = {};
      localStorage.setItem("x-comments", JSON.stringify([]));
      localStorage.setItem("x-comments-player-map", JSON.stringify({}));
      start();
    }
  };

  // 暂停
  const pause = () => {
    if (confirm("确定要暂停吗？")) {
      status = "Paused";
      clearTimers();
      console.log("Paused scraping comments");

      setText("status", status);
    }
  };

  // 继续
  const resume = () => {
    status = "Running";
    start();
    console.log("Resumed scraping comments");

    setText("status", status);
  };

  // 停止
  const stop = () => {
    if (confirm("确定要停止吗？")) {
      clearTimers();
      console.log("Stopped scraping comments");

      status = "Stopped";
      setText("status", status);
    }
  };

  // 清理定时器
  const clearTimers = () => {
    try {
      clearInterval(timerExportComments);
      clearInterval(timerAppendTime);
      console.log("Timers cleared");
    } catch (error) {
      console.log("clearTimers error:", error);
    }
  };

  // ------------------------------ 页面操作 ------------------------------

  // 封装一个创建按钮的函数
  const createButton = (text, onClick) => {
    const button = document.createElement("button");
    button.innerText = text;
    button.style = "padding: 10px; margin: 10px; font-size: 16px;";
    button.onclick = onClick;
    return button;
  };

  // 清理containerID关联的DOM
  const clearDisplay = () => {
    const container = document.querySelector(`#${containerID}`);
    if (container) {
      container.remove();
    }
  };

  // 在页面上添加按钮
  const createDisplay = () => {
    const container = document.querySelector(elCommentContainer);
    console.log(container);

    // ################################### 操作区域 ###################################

    const divContainer = document.createElement("div"); // prettier-ignore
    const startButton = createButton("开始监听（保留历史记录）", start); // prettier-ignore
    const startWithClearButton = createButton("开始监听（重新记录，清除历史记录）", startWithClear); // prettier-ignore
    const pauseButton = createButton("暂停监听", pause); // prettier-ignore
    const resumeButton = createButton("继续监听", resume); // prettier-ignore
    const stopButton = createButton("结束监听", stop); // prettier-ignore
    const downloadButton = createButton("下载评论", downloadComments); // prettier-ignore

    divContainer.id = containerID;

    divContainer.style = "position: fixed; bottom: 100px; right: 400px; z-index: 9999; display: flex; flex-direction: column;"; // prettier-ignore
    startButton.style = "background-color: #4CAF50; color: white; margin-top: 5px;"; // prettier-ignore
    startWithClearButton.style = "background-color: #4CAF50; color: white; margin-top: 5px;"; // prettier-ignore
    pauseButton.style = "background-color: #E6A23C; color: white; margin-top: 5px;"; // prettier-ignore
    resumeButton.style = "background-color: #909399; color: white; margin-top: 5px;"; // prettier-ignore
    stopButton.style = "background-color: #f44336; color: white; margin-top: 5px;"; // prettier-ignore
    downloadButton.style = "background-color: #008CBA; color: white; margin-top: 5px;"; // prettier-ignore

    setText("status", status);
    setText("startTime", startTime);
    setText("commentScrapedTime", "-");
    setText("commentLength", comments.length);
    setText("commentPlayers", Object.keys(commentMap).length);

    statusText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px;"; // prettier-ignore
    startTimeText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px;"; // prettier-ignore
    commentScrapedTime.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px;"; // prettier-ignore
    commentLengthText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px;"; // prettier-ignore
    commentPlayersText.style = "margin-top: 5px; margin-bottom: 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 5px;"; // prettier-ignore

    divContainer.appendChild(startButton);
    divContainer.appendChild(startWithClearButton);
    divContainer.appendChild(pauseButton);
    divContainer.appendChild(resumeButton);
    divContainer.appendChild(stopButton);
    divContainer.appendChild(downloadButton);
    divContainer.appendChild(statusText);
    divContainer.appendChild(startTimeText);
    divContainer.appendChild(commentScrapedTime);
    divContainer.appendChild(commentLengthText);
    divContainer.appendChild(commentPlayersText);

    container.appendChild(divContainer);

    // ################################### 控制显示区域 ##################################

    const showContainer = document.createElement("div"); // prettier-ignore
    const showButton = createButton("显示操作", () => divContainer.style.visibility = "visible"); // prettier-ignore
    const hideButton = createButton("隐藏操作", () => divContainer.style.visibility = "hidden"); // prettier-ignore

    showContainer.style = "position: fixed; bottom: 100px; right: 100px; z-index: 9999; display: flex;"; // prettier-ignore
    showButton.style = "background-color: #4CAF50; color: white; margin-top: 5px;"; // prettier-ignore
    hideButton.style = "background-color: #f44336; color: white; margin-top: 5px;"; // prettier-ignore

    showContainer.appendChild(showButton);
    showContainer.appendChild(hideButton);

    container.appendChild(showContainer);
  };

  // ------------------------------ 入口函数 ------------------------------

  // 主函数
  const main = () => {
    clearDisplay();
    createDisplay();
  };

  // 执行主函数
  timerCheckDom = setInterval(() => {
    if (document.querySelector(elCommentContainer)) {
      main();
      console.log("DOM已经加载，开始执行主函数");
      clearInterval(timerCheckDom);
    } else {
      console.log("DOM未加载，继续等待");
    }
  }, 500);
})();
