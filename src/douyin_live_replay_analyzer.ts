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

import { downloadTextFile } from './utils/file';
import { wait } from './utils/tool';
import { exportMultipleSheetsToExcel } from './utils/xlsx';
import { triggerMouseEnterWithDelay } from './utils/element';
import { parseHTML, getElementText } from './utils/dom';
import { IndexedDBUtil } from './utils/indexdb';
import { TabMap, DictDataPK, DictDataAudienceAll, DictDataNewAudience, DictDataAudienceAllGetUserCardInfo } from './constants/dict';

(function () {
  'use strict';

  console.log('Douyin Replay Scraper is running');

  // ------------------------------ 初始化 ------------------------------

  // 直播场次数据区域的选择器
  const containerID = 'x-replays-container';
  const elReplayContainer = "#root > div > div.mb-4.flex.gap-4 > div.w-\\[400px\\].grow > div.mb-4.rounded-medium.p-4.\\!mb-0.bg-white"; // prettier-ignore
  const elNickName = "#root > div > div:nth-child(2) > div > div > div.mb-4.flex.justify-between > div > div > div.mb-2\\.5.max-w-\\[500px\\].truncate.text-6.font-bold.text-text-0 > span > span"; // prettier-ignore
  const elStartTime = "#root > div > div:nth-child(2) > div > div > div.mb-4.flex.justify-between > div > div > div.flex.gap-4 > div:nth-child(3) > span > span"; // prettier-ignore
  const elEndTime = "#root > div > div:nth-child(2) > div > div > div.mb-4.flex.justify-between > div > div > div.flex.gap-4 > div:nth-child(4) > span > span"; // prettier-ignore
  const elTabAudienceAllFirstElement = "#root > div > div.mb-4.flex.gap-4 > div.w-\\[400px\\].grow > div.mb-4.rounded-medium.p-4.\\!mb-0.bg-white > div:nth-child(2) > div.tableWrapper--OLQls > div > div > div > div > div > div.semi2-table-container > div > table > tbody > tr:nth-child(1) > td:nth-child(2) > div"; // prettier-ignore

  // 直播场次数据的Tab选择器
  const elReplayTabPk = '#semiTabpk'; // PK榜
  const elReplayTabAudienceAll = '#semiTabaudienceAll'; // 观众总榜
  const elReplayTabNewAudience = '#semiTabnewAudience'; // 新付费观众榜
  const elReplayTabGuest = '#semiTabguest'; // 连线嘉宾榜

  // 缓存数据Key值
  const keyXhrRequests = 'xhrRequests'; // 缓存请求数据
  const keyXhrResponses = 'xhrResponses'; // 缓存响应数据

  // IndexedDB相关
  const indexdbVersion = 20250626; // IndexedDB版本号
  const indexdbDbName = 'DBDouyinReplayData'; // IndexedDB数据库名称
  const indexdbStoreReplayDataName = 'StoreReplayData'; // IndexedDB StoreReplayData表名称
  const indexdbStoreUserIDMapSecUidAndUniqueIdName = 'StoreUserIDMapSecUidAndUniqueId'; // IndexedDB StoreUserIDMapSecUidAndUniqueIdName表名称
  const indexdbInstance = new IndexedDBUtil(indexdbDbName, indexdbVersion, {
    [indexdbStoreReplayDataName]: { keyPath: 'id' },
    [indexdbStoreUserIDMapSecUidAndUniqueIdName]: { keyPath: 'userID' }
  });

  // 每页获取的直播场次数据条数
  const pageSizeAudienceAll = 100;

  // 直播场次数据的请求URL
  const urlTabPk = 'https://union.bytedance.com/ark/api/data/pugna_component/data/v2/faction/room_analysis/pk_data';
  const urlTabAudienceAll = 'https://union.bytedance.com/ark/api/data/pugna_component/data/v2/anchor/live/room_rank_with_filter';
  const urlTabNewAudience = 'https://union.bytedance.com/ark/api/data/pugna_component/data/v2/room/detail/new_pay_rank';
  const urlTabGuest = 'https://union.bytedance.com/ark/api/data/pugna_component/data/v2/anchor/live/room_rank_with_filter';
  const urlTabAudienceAllGetUserCard = 'https://union.bytedance.com/ark/api/broker/follow/get_user_card';
  const urlGetCommonInfo = 'https://union.bytedance.com/ark/api/data/pugna_component/data/v2/anchor_live/room_base_stats'; // 获取直播间基本信息

  // ------------------------------ 定时器 ------------------------------

  let timerCheckDom = null;
  let timerRuntime = null;

  // 运行状态
  let status = 'Running'; // Running, Error
  let runtimeTime = null;
  let runtimeLogs = '日志区域：\n'; // 运行日志

  // 运行状态相关的DOM元素
  const statusText = document.createElement('p');
  const runtimeTimeText = document.createElement('p');
  const logContainer = document.createElement("pre"); // prettier-ignore

  // ------------------------------ 核心操作 ------------------------------

  // 设置运行状态文本
  const setText = (type: string, text: string) => {
    switch (type) {
      case 'status':
        statusText.innerText = `运行状态: ${text}`;
        break;
      case 'runtimeTime':
        runtimeTimeText.innerText = `运行时间: ${text}`;
        break;
      default:
        break;
    }
  };

  // 设置执行状态文本
  const setOperationLog = (text: string, padStart: string = '', padEnd: string = '') => {
    runtimeLogs += `${padStart}● ${new Date().toLocaleTimeString()} - ${text}${padEnd}\n`;
    logContainer.innerText = runtimeLogs;
    logContainer.scrollTop = logContainer.scrollHeight; // 滚动到底部
  };

  // 切换到标签
  const changeTab = (tab: string) => {
    const tabElement = document.querySelector(tab) as HTMLElement;
    setOperationLog(`寻找标签定位元素: ${tab}`);
    if (tabElement) {
      tabElement.click();
      setOperationLog(`成功切换到标签: ${tab}`);
    } else {
      console.error(`未找到标签元素: ${tab}`);
      setOperationLog(`未找到标签元素: ${tab}`);
    }
  };

  // 翻译对象的key
  const translateObjectKeys = (objArr: Array<any>, translationMap: Record<string, string>, uniqueIdMap: Record<string, any>, mappingKey: string = 'userID') => {
    return objArr.map(obj => {
      const item = Object.keys(obj).reduce((acc, key) => {
        const translatedKey = translationMap[key] || key; // 使用翻译映射或原始键
        acc[translatedKey] = obj[key];
        return acc;
      }, {});
      item['唯一ID（抖音号）'] = uniqueIdMap[obj[mappingKey]]?.['uniqueId'] || '未知抖音号'; // 添加唯一ID（抖音号）
      return item;
    });
  };

  // ------------------------------ 下载操作 ------------------------------

  // 下载直播场次数据
  const downloadReplays = async () => {
    setOperationLog('开始下载直播场次数据，请稍等...');

    const nickname = document.querySelector(elNickName)?.textContent || '未知主播';
    const startTime = document.querySelector(elStartTime)?.textContent || '未知开始时间';
    const endTime = document.querySelector(elEndTime)?.textContent || '未知结束时间';

    // 获取数据
    const xhrResponses = GM_getValue(keyXhrResponses, {});
    const indexdbResponses = (await indexdbInstance.getAllItems(indexdbStoreUserIDMapSecUidAndUniqueIdName)) || [];
    const indexdbResponseMap = indexdbResponses.reduce((acc, item) => {
      acc[item.userID] = {
        nickname: item.nickname || '未知昵称',
        secUid: item.secUid || '未知SecUid',
        uniqueId: item.uniqueId || '未知UniqueId',
        userID: item.userID || '未知用户ID'
      };
      return acc;
    }, {});
    const replays = Object.assign({}, xhrResponses, { [TabMap.AudienceAllGetUserCard]: { data: indexdbResponses } });

    // 生成xlsx文件
    // if (Object.keys(replays).length === 0) {
    //   setOperationLog('没有可下载的直播场次数据');
    //   alert('没有可下载的直播场次数据');
    //   return;
    // }
    // exportToExcel(replays, `douyin_replay_data_${new Date().toISOString()}.xlsx`);

    // 生成多表的xlsx文件
    if (Object.keys(replays).length === 0) {
      setOperationLog('没有可下载的直播场次数据');
      alert('没有可下载的直播场次数据');
      return;
    }
    const freplays = Object.keys(replays).reduce((acc, key) => {
      if (key === TabMap.PK) acc['PK榜'] = translateObjectKeys(replays[key]['data'] || [], DictDataPK, indexdbResponseMap, 'userID');
      else if (key === TabMap.AudienceAll) acc['观众总榜'] = translateObjectKeys(replays[key]['data'] || [], DictDataAudienceAll, indexdbResponseMap, 'userID');
      else if (key === TabMap.NewAudience) acc['新观众付费榜'] = translateObjectKeys(replays[key]['data'] || [], DictDataNewAudience, indexdbResponseMap, 'userID');
      else if (key === TabMap.Guest) acc['连线嘉宾榜'] = translateObjectKeys(replays[key]['data'] || [], DictDataPK, indexdbResponseMap, 'userID');
      else if (key === TabMap.AudienceAllGetUserCard) acc['观众总榜获取用户卡片'] = translateObjectKeys(replays[key]['data'] || [], DictDataAudienceAllGetUserCardInfo, indexdbResponseMap, 'userID');
      return acc;
    }, {});
    exportMultipleSheetsToExcel(freplays, `抖音直播场次数据_${nickname}_From_${startTime}_To_${endTime}.xlsx`);

    // saveFile(
    //   new Blob([logContainer.innerText], { type: "text/plain" }),
    //   `douyin_replay_log_${new Date().toISOString()}.txt`
    // );

    setOperationLog('直播场次数据已下载，请查看下载的文件');
    alert('直播场次数据已下载，请查看下载的文件');
  };

  // ------------------------------ 收集请求操作 ------------------------------

  // 收集请求数据
  const collectRequests = async () => {
    setOperationLog("即将开始收集请求数据，页面会自动进行跳转以获取请求数据，请不要进行其他操作，点击确定开始"); // prettier-ignore
    if(!confirm("即将开始收集请求数据，页面会自动进行跳转以获取请求数据，请不要进行其他操作，点击确定开始")) return; //  prettier-ignore

    setOperationLog('开始收集请求数据，请稍等...');

    changeTab(elReplayTabNewAudience);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabPk);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabGuest);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabAudienceAll);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabNewAudience);
    await wait(2000); // 等待2秒钟以确保切换完成
    changeTab(elReplayTabAudienceAll);
    await wait(5000); // 等待5秒钟以确保切换完成

    setOperationLog('请求数据收集完成，现在可以执行数据采集操作了');
    alert('请求数据收集完成，现在可以执行数据采集操作了');
  };

  // ------------------------------ 采集请求操作 ------------------------------

  // ❶ 采集 - PK榜
  const startExportPK = async () => {
    const storedRequestMap = GM_getValue(keyXhrRequests, {});
    const storedResponseMap = GM_getValue(keyXhrResponses, {});
    console.log('Stored requests:', storedRequestMap);
    console.log('Stored responses:', storedResponseMap);

    setOperationLog('开始导出PK榜数据，请稍等...');

    changeTab(elReplayTabPk);
    await wait(2000); // 等待2秒钟以确保切换完成

    if (confirm('确定要开始当前直播场次的PK榜数据吗？')) {
      if (!storedRequestMap[TabMap.PK]) {
        setOperationLog('未捕获到PK榜请求，请先进行收集请求数据操作');
        alert('未捕获到PK榜请求，请先进行收集请求数据操作');
        return;
      }

      // 回放请求
      setOperationLog('开始回放PK榜请求');
      const rsp = await replayRequest(storedRequestMap[TabMap.PK]);
      console.log('开始回放PK榜请求 Rsp:', rsp);

      const responseData = JSON.parse(rsp.body)['data'] || {};
      const pkData = JSON.parse(responseData['data_string']) || {};
      if (!pkData) {
        setOperationLog('未捕获到PK榜数据');
        return;
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到PK榜数据，总数: ${pkData.data?.length || 0}`); // prettier-ignore
      setOperationLog(`捕获到PK榜数据，已存储到本地存储，数据内容: ${JSON.stringify(pkData)}`); // prettier-ignore
      storedResponseMap[TabMap.PK] = pkData;
      GM_setValue(keyXhrResponses, storedResponseMap);

      setOperationLog('PK榜数据采集成功');
      alert('PK榜数据采集成功，请查看控制台输出');
    }
  };

  // ❷ 采集 - 观众总榜
  const startExportAudienceAll = async () => {
    const storedRequestMap = GM_getValue(keyXhrRequests, {});
    const storedResponseMap = GM_getValue(keyXhrResponses, {});
    console.log('Stored requests:', storedRequestMap);
    console.log('Stored responses:', storedResponseMap);

    changeTab(elReplayTabAudienceAll);
    await wait(2000); // 等待2秒钟以确保切换完成

    setOperationLog('开始导出观众总榜数据，请稍等...');

    if (confirm('确定要开始当前直播场次的观众总榜数据吗？')) {
      if (!storedRequestMap[TabMap.AudienceAll]) {
        setOperationLog('未捕获到观众总榜请求，请先进行收集请求数据操作');
        alert('未捕获到观众总榜请求，请先进行收集请求数据操作');
        return;
      }

      // 回放请求
      setOperationLog('开始回放观众总榜请求');
      const requestBase = storedRequestMap[TabMap.AudienceAll];

      // 发起回放请求
      const rsp = await replayRequest(requestBase);
      const responseData = JSON.parse(rsp.body)['data'] || {};
      const audienceAllData = JSON.parse(responseData['data_string']) || {};
      if (!audienceAllData) {
        setOperationLog('未捕获到观众总榜数据');
        return;
      }

      // 检查并获取总数
      if (audienceAllData.code !== 0) {
        setOperationLog('未捕获到观众总榜数据');
        alert('未捕获到观众总榜数据，请检查控制台输出');
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
        url.searchParams.set('page', String(page));
        url.searchParams.set('size', String(pageSize));
        requestBase.url = url.toString();

        // 执行回放请求
        const pageRsp = await replayRequest(requestBase); // prettier-ignore
        const responseData = JSON.parse(pageRsp.body)['data'] || {};
        const audienceAllData = JSON.parse(responseData["data_string"])['data']['series'] || []; // prettier-ignore

        setOperationLog(`第 ${page} / ${pageCount} 次拉取成功，获取到观众总榜数据条数: ${audienceAllData.length}`); // prettier-ignore

        responseList.push(...audienceAllData);
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到观众总榜数据，已存储到本地存储，数据内容: ${JSON.stringify(responseList)}`); // prettier-ignore
      storedResponseMap[TabMap.AudienceAll] = { data: responseList };
      GM_setValue(keyXhrResponses, storedResponseMap);

      setOperationLog('观众总榜数据采集成功');
      alert('观众总榜数据采集成功，请查看控制台输出');
    }
  };

  //  ❸ 采集 - 新观众付费榜
  const startExportNewAudience = async () => {
    const storedRequestMap = GM_getValue(keyXhrRequests, {});
    const storedResponseMap = GM_getValue(keyXhrResponses, {});
    console.log('Stored requests:', storedRequestMap);
    console.log('Stored responses:', storedResponseMap);

    changeTab(elReplayTabNewAudience);
    await wait(2000); // 等待2秒钟以确保切换完成

    setOperationLog('开始导出新观众付费榜数据，请稍等...');

    if (confirm('确定要开始当前直播场次的新观众付费榜数据吗？')) {
      if (!storedRequestMap[TabMap.NewAudience]) {
        setOperationLog('未捕获到新观众付费榜请求，请先进行收集请求数据操作');
        alert('未捕获到新观众付费榜请求，请先进行收集请求数据操作');
        return;
      }

      // 回放请求
      setOperationLog('开始回放新观众付费榜请求');
      const requestBase = storedRequestMap[TabMap.NewAudience];

      // 发起回放请求
      const rsp = await replayRequest(requestBase);
      const responseData = JSON.parse(rsp.body)['data'] || {};
      const newAudienceData = JSON.parse(responseData['data_string']) || {};
      if (!newAudienceData) {
        setOperationLog('未捕获到新观众付费榜数据');
        return;
      }

      // 检查并获取总数
      if (newAudienceData.code !== 0) {
        setOperationLog('未捕获到新观众付费榜数据');
        alert('未捕获到新观众付费榜数据，请检查控制台输出');
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
        url.searchParams.set('offset', String(page));
        url.searchParams.set('limit', String(pageSize));
        requestBase.url = url.toString();

        // 执行回放请求
        const pageRsp = await replayRequest(requestBase); // prettier-ignore
        const responseData = JSON.parse(pageRsp.body)['data'] || {};
        const newAudienceData = JSON.parse(responseData["data_string"])['data']['series'] || []; // prettier-ignore

        setOperationLog(`第 ${page} / ${pageCount} 次拉取成功，获取到新观众付费榜数据条数: ${newAudienceData.length}`); // prettier-ignore

        responseList.push(...newAudienceData);
      }

      // 保存数据到本地存储
      setOperationLog(`捕获到新观众付费榜数据，已存储到本地存储，数据内容: ${JSON.stringify(responseList)}`); // prettier-ignore
      storedResponseMap[TabMap.NewAudience] = { data: responseList };
      GM_setValue(keyXhrResponses, storedResponseMap);

      setOperationLog('新观众付费榜数据采集成功');
      alert('新观众付费榜数据采集成功，请查看控制台输出');
    }
  };

  // ❹ 采集 - 连线嘉宾榜
  const startExportGuest = async () => {
    // 暂时不支持
    setOperationLog('连线嘉宾榜数据导出暂不支持');
    alert('连线嘉宾榜数据导出暂不支持');
    return;
  };

  // ➎ 采集 - 一键采集全部
  const startExportAllField = async () => {
    if (!confirm('即将开始一键采集全部数据，操作可能需要一些时间，请不要进行其他操作，点击确定开始')) return;

    setOperationLog("即将开始一键采集全部数据，操作可能需要一些时间，请不要进行其他操作..."); // prettier-ignore

    setOperationLog('开始执行收集请求数据操作，请稍等...');
    await collectRequests();
    setOperationLog('收集请求数据操作完成，正在准备采集数据');

    setOperationLog('开始采集PK榜数据，请稍等...');
    setOperationLog('开始采集PK榜数据，请稍等...');
    await startExportPK();
    setOperationLog('PK榜数据采集完成，正在采集观众总榜数据');
    await startExportAudienceAll();
    setOperationLog('观众总榜数据采集完成，正在采集新观众付费榜数据');
    await startExportNewAudience();
    // setOperationLog('新观众付费榜数据采集完成，正在采集连线嘉宾榜数据');
    // await startExportGuest();
    setOperationLog('所有数据采集操作已完成，正在准备下载数据');

    setOperationLog('即将开始下载数据，请稍等...');
    await downloadReplays();
    setOperationLog('数据下载完成，请查看下载的文件');

    alert('数据下载完成，请查看下载的文件');
  };

  // ❻ 采集 - 采集抖音号等个人信息
  const collectAudienceAllSecUidAndUniqueId = async () => {
    setOperationLog('开始切换到观众总榜Tab，请稍等...');

    // 切换到观众总榜Tab
    changeTab(elReplayTabAudienceAll);
    await wait(2000); // 等待2秒钟以确保切换完成

    setOperationLog('开始采集观众总榜Tab中第一个粉丝的SecUid和UniqueId，请稍等...');

    // 选择第一个观众总榜元素，执行MouseEnter事件
    const firstElement = document.querySelector(elTabAudienceAllFirstElement) as HTMLElement;
    await triggerMouseEnterWithDelay(firstElement, 2000);

    // 判断是否存在针对AudienceAllGetUserCard的请求
    const storedRequestMap = GM_getValue(keyXhrRequests, {});
    if (!storedRequestMap[TabMap.AudienceAllGetUserCard]) {
      setOperationLog('未捕获到观众总榜获取用户卡片请求，请重新执行请求观众总榜抖音号的操作');
      alert('未捕获到观众总榜获取用户卡片请求，请重新执行请求观众总榜抖音号的操作');
      return;
    }

    setOperationLog(`已采集到第一个观众总榜元素的卡片请求： ${JSON.stringify(storedRequestMap[TabMap.AudienceAllGetUserCard])}`); // prettier-ignore
    setOperationLog('开始回放观众总榜获取用户卡片请求，请稍等...');

    // 构造回放请求，来获取每一个观众的SecUid和UniqueId
    const requestBase = storedRequestMap[TabMap.AudienceAllGetUserCard];

    // 循环观众总榜，获取数据
    const xhrResponses = GM_getValue(keyXhrResponses, {});
    if (!xhrResponses[TabMap.AudienceAll] || !xhrResponses[TabMap.AudienceAll]?.data || (xhrResponses[TabMap.AudienceAll]?.data || []).length === 0) {
      setOperationLog('未捕获到观众总榜数据，请先进行收集请求数据操作');
      alert('未捕获到观众总榜数据，请先进行收集请求数据操作');
      return;
    }

    const audienceAllData = xhrResponses[TabMap.AudienceAll].data || [];
    setOperationLog(`观众总榜数据总数: ${audienceAllData.length}，即将进行SecUid和UniqueId的采集，请稍等...`); // prettier-ignore

    // ##################################################################
    // ############### 遍历观众总榜数据，获取SecUid和UniqueId ###############
    // ##################################################################

    const total = audienceAllData.length;
    for (let index = 0; index < total; index++) {
      const indexLabel = `${index + 1}/${total}`;
      const item = audienceAllData[index];
      const userID = item['userID'] || '';
      if (!userID) {
        setOperationLog(`未找到用户ID，跳过当前用户`);
        continue;
      }

      setOperationLog(`############### 开始 ${indexLabel}，用户ID ${userID} ###############`, '\n'); // prettier-ignore

      // 判断IndexedDB中是否已存在该用户的SecUid和UniqueId
      const exists = await indexdbInstance.hasItem(indexdbStoreUserIDMapSecUidAndUniqueIdName, userID);
      if (exists) {
        setOperationLog(`用户ID: ${userID} 的SecUid和UniqueId已存在于IndexedDB中，跳过当前用户`);
        continue;
      }

      // 修改requestBase中的url字段的&audience_id字段信息
      const url = new URL(requestBase.url);
      url.searchParams.set('audience_id', userID);
      requestBase.url = url.toString();

      const rsp = await replayRequest(requestBase);
      const responseData = JSON.parse(rsp.body)['data'] || {};
      const baseUrl = responseData['user_base_info']['person_home_page_url'] || '';
      setOperationLog(`成功回放观众总榜获取用户卡片请求，获取到的用户主页URL: ${baseUrl}`); // prettier-ignore

      // 请求baseUrl来获取SecUid和UniqueId
      setOperationLog('开始请求用户主页URL以获取SecUid和UniqueId，请稍等...');
      const secUidAndUniqueIdRsp = await getRequest(baseUrl);
      const domHtml = secUidAndUniqueIdRsp['body'];

      setOperationLog(`成功获取用户主页HTML内容，长度为: ${domHtml.length}, 即将进行HTML代码解析，请稍等...`); // prettier-ignore

      // 解析HTML内容
      const doc = parseHTML(domHtml);

      const followAndStar = getElementText(doc, '#user_detail_element > div > div.SDJA4Oo6.RsRFV44h.tA_RqgBC.Z6Fyt4lf > div.zI865BLc > div.M90xLYkB'); // prettier-ignore
      const nickname = getElementText(doc, '#user_detail_element > div > div.SDJA4Oo6.RsRFV44h.tA_RqgBC.Z6Fyt4lf > div.zI865BLc > div.qRqKP4qc > h1 > span > span > span > span > span > span'); // prettier-ignore
      const others = getElementText(doc, '#user_detail_element > div > div.SDJA4Oo6.RsRFV44h.tA_RqgBC.Z6Fyt4lf > div.zI865BLc > p'); // prettier-ignore
      const uniqueIdStr = getElementText(doc, '#user_detail_element > div > div.SDJA4Oo6.RsRFV44h.tA_RqgBC.Z6Fyt4lf > div.zI865BLc > p > span.NtumbRDj'); // prettier-ignore
      const locationStr = getElementText(doc, '#user_detail_element > div > div.SDJA4Oo6.RsRFV44h.tA_RqgBC.Z6Fyt4lf > div.zI865BLc > p > span.C2DgpWtn'); // prettier-ignore
      setOperationLog(`成功获取用户主页的描述信息: ${nickname}, ${uniqueIdStr}, ${locationStr}, ${followAndStar}`); // 举例：“抖音号：F0098”

      const follow = followAndStar.match(/关注(\d+)/)?.[1] || ''; // 从描述中提取关注数
      const star = followAndStar.match(/粉丝(\d+)/)?.[1] || ''; // 从描述中提取粉丝数
      const favorited = followAndStar.match(/获赞(\d+)/)?.[1] || ''; // 从描述中提取获赞数 -> '关注120粉丝7472获赞301'

      // 举例：https://www.douyin.com/user/MS4wLjABAAAAXCaU01Ka7KaaBf2td0_qLkEIyluxR7xe98XAguwd3JI
      const secUid = baseUrl.split('/')[4] || ''; // 从URL中提取SecUid
      const uniqueId = uniqueIdStr.match(/抖音号：(\w+)/)?.[1] || ''; // 从描述中提取UniqueId
      const location = locationStr.match(/IP属地：([\u4e00-\u9fa5]+)/)?.[1] || ''; // 从描述中提取IP属地

      setOperationLog(`成功提取SecUid: ${secUid}`); // prettier-ignore
      setOperationLog(`成功提取Star: ${followAndStar}`); // prettier-ignore
      setOperationLog(`成功提取UniqueId: ${uniqueId}, IP属地: ${location}, Others: ${others}`); // prettier-ignore

      if (!secUid || !uniqueId) {
        setOperationLog(`未找到SecUid或UniqueId，跳过当前用户ID: ${userID}`);
        continue;
      }

      // 存储数据库
      await indexdbInstance
        .upsertItem(indexdbStoreUserIDMapSecUidAndUniqueIdName, {
          nickname,
          userID: userID,
          secUid: secUid,
          uniqueId: uniqueId,
          location: location,
          follow: follow,
          star: star,
          favorited: favorited,
          timestamp: new Date().toISOString(),
          others: others
        })
        .then(() => {
          setOperationLog(`成功存储SecUid和UniqueId到IndexedDB，SecUid: ${secUid}, UniqueId: ${uniqueId}`); // prettier-ignore
        })
        .catch(error => {
          setOperationLog(`存储SecUid和UniqueId到IndexedDB失败: ${error.message}`); // prettier-ignore
        });

      setOperationLog(`用户ID: ${userID} 的SecUid和UniqueId已成功存储到IndexedDB中`); // prettier-ignore
      setOperationLog(`############### 完成 ${indexLabel}，用户ID ${userID} ###############`); // prettier-ignore

      // 等待1秒钟以避免请求过快
      await wait(1500);
    }
  };

  // ------------------------------ 调试操作 ------------------------------

  // 导出日志内容到文本文件
  const startDebug = () => {
    setOperationLog('准备调试模式，请查看控制台输出');
    const logs = logContainer.textContent;
    // 根据这个格式换行 "● "
    const flogs = (logs || '').replace(/● /g, '\n ●').trim(); // prettier-ignore
    setOperationLog('成功获取到日志内容');
    setOperationLog(`准备导出日志内容到文本文件`);
    downloadTextFile(flogs, `抖音调试日志文件_${new Date().toISOString()}.txt`);
    setOperationLog('日志内容已导出到文本文件，请查看下载的文件');
    alert('日志内容已导出到文本文件，请查看下载的文件');
  };

  //  ------------------------------ 拦截请求操作 ------------------------------

  // 拦截XHR HTTP请求
  const interceptXHR = () => {
    console.log('Intercepting XMLHttpRequest');

    setOperationLog('初始化XHR拦截器');

    // 重写XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method: any, url: any) {
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
      let isFlagged = false;
      const requestData = {
        type: '',
        id: Date.now() + Math.random().toString(36).substr(2),
        url: this.__url,
        method: this._method,
        query: this.__url.split('?')[1] || '', // 获取URL中的查询参数
        body: body,
        headers: this._requestHeaders,
        cookies: document.cookie,
        timestamp: new Date().toISOString()
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
      else if (this.__url.includes(urlTabAudienceAllGetUserCard)) {
        isFlagged = true;
        requestData.type = TabMap.AudienceAllGetUserCard;
        setOperationLog(`拦截到请求：观众总榜获取用户卡片请求，${JSON.stringify(requestData)}`); // prettier-ignore
      } else if (this.__url.includes(urlGetCommonInfo)) {
        isFlagged = true;
        requestData.type = TabMap.CommonInfo;
        setOperationLog(`拦截到请求：公共信息请求，${JSON.stringify(requestData)}`); // prettier-ignore
      } else {
        // 如果不是我们关心的请求，则不进行处理
      }

      // 如果是PK榜请求，则打印请求和响应
      if (isFlagged) {
        this.addEventListener('load', function () {
          console.log('XHR Response:', {
            url: this.__url,
            method: this._method,
            status: this.status,
            response: this.response,
            headers: this.getAllResponseHeaders()
          });
          requestData.url = this.__url; // 更新URL
          // 打印请求的URL、方法、请求体、请求头等信息
          console.log('拦截到请求:', requestData);
          // 存储请求
          const storedRequestMap = GM_getValue(keyXhrRequests, {});
          const storedResponseMap = GM_getValue(keyXhrResponses, {});
          storedRequestMap[requestData.type] = requestData;
          GM_setValue(keyXhrRequests, storedRequestMap);
          setOperationLog(`存储请求数据：${requestData.type}，${JSON.stringify(Object.keys(storedRequestMap))}`); // prettier-ignore
        });
      }

      return originalSend.apply(this, arguments);
    };
  };

  // 发送回放请求
  const replayRequest = (request: any): Promise<any> => {
    setOperationLog(`开始回放请求: ${request.type}，${JSON.stringify(request)}`); // prettier-ignore
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: request.method,
        url: request.url, // URL中
        timeout: 10000, // 设置超时时间为10秒
        headers: request.headers,
        data: request.body,
        onload: function (response: any) {
          // 响应数据在response.responseText中，如果是二进制数据，可能需要使用response.response
          resolve({
            status: response.status,
            statusText: response.statusText,
            headers: response.responseHeaders,
            body: response.responseText,
            response: response // 完整的响应对象
          });
        },
        onerror: function (error: { message: any }) {
          setOperationLog(`回放请求失败: ${request.type}，错误信息: ${error.message}`); // prettier-ignore
          reject(error);
        },
        ontimeout: function () {
          setOperationLog(`回放请求超时: ${request.type}`); // prettier-ignore
          reject(new Error('Request timed out'));
        }
      });
    });
  };

  // 发起Get请求
  const getRequest = (url: string): Promise<any> => {
    setOperationLog(`开始发起GET请求: ${url}`);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        timeout: 10000, // 设置超时时间为10秒
        onload: function (response: any) {
          resolve({
            status: response.status,
            statusText: response.statusText,
            headers: response.responseHeaders,
            body: response.responseText,
            response: response // 完整的响应对象
          });
        },
        onerror: function (error: { message: any }) {
          setOperationLog(`GET请求失败，错误信息: ${error.message}`);
          reject(error);
        },
        ontimeout: function () {
          setOperationLog(`GET请求超时`);
          reject(new Error('Request timed out'));
        }
      });
    });
  };

  // ------------------------------ 页面操作 ------------------------------

  // 封装一个创建按钮的函数
  const createButton = (text: string, onClick: () => any) => {
    const button = document.createElement('button');
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
    setOperationLog('创建操作区域');

    const containerReplay = document.querySelector(elReplayContainer);
    console.log('current container:', containerReplay);

    // ################################### 操作区域 ###################################

    const operationContainer = document.createElement("div"); // prettier-ignore
    const operationLeft = document.createElement("div"); // prettier-ignore
    const operationRight = document.createElement("div"); // prettier-ignore

    operationContainer.id = containerID;
    operationContainer.style.height = "550px"; // prettier-ignore
    operationContainer.style.position = "fixed"; // prettier-ignore
    operationContainer.style.bottom = "50px"; // prettier-ignore
    operationContainer.style.right = "50px"; // prettier-ignore
    operationContainer.style.width = "1000px"; // prettier-ignore
    operationContainer.style.zIndex = "9999"; // prettier-ignore
    operationContainer.style.display = "flex"; // prettier-ignore
    operationContainer.style.flexDirection = "row"; // prettier-ignore
    operationContainer.style.backgroundColor = "rgba(255, 255, 255, 0.8)"; // prettier-ignore
    operationContainer.style.padding = "30px"; // prettier-ignore
    operationContainer.style.borderRadius = "10px"; // prettier-ignore
    operationContainer.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)"; // prettier-ignore
    operationContainer.style.visibility = "visible"; // prettier-ignore

    operationLeft.style = "width: 300px; background-color: #f0f0f0;"; // prettier-ignore
    operationRight.style = "width: calc(100% - 300px); flex: 1; display: flex; flex-direction: column; align-items: center;"; // prettier-ignore

    // ----- 创建操作按钮 -----

    const collectButton = createButton("☃ 执行请求捕获程序", collectRequests); // prettier-ignore
    const exportPkButton = createButton("⛐ 采集 - PK榜", startExportPK); // prettier-ignore
    const exportAudienceAllButton = createButton("⛐ 采集 - 观众总榜", startExportAudienceAll); // prettier-ignore
    const exportNewAudienceButton = createButton("⛐ 采集 - 新观众付费榜", startExportNewAudience); // prettier-ignore
    const exportGuestButton = createButton("⛐ 采集 - 连线嘉宾榜", startExportGuest); // prettier-ignore
    const exportAllButton = createButton("⛐ 一键导出全部数据（不太稳定）", startExportAllField); // prettier-ignore
    const collectAudienceAllSecUidAndUniqueIdButton = createButton("⛐ 采集 - 抖音号清单（观众总榜）", collectAudienceAllSecUidAndUniqueId); // prettier-ignore
    const downloadButton = createButton("⎋ 下载当前已保存的数据", downloadReplays); // prettier-ignore
    const debugButton = createButton("⚙️ 导出调试日志", startDebug); // prettier-ignore

    collectButton.style = "background-color: #008CBA; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportPkButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportAudienceAllButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportNewAudienceButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportGuestButton.style = "background-color: #909399; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    exportAllButton.style = "background-color: #909399; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    collectAudienceAllSecUidAndUniqueIdButton.style = "background-color: #4CAF50; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    downloadButton.style = "background-color: #008CBA; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    debugButton.style = "background-color: #E6A23C; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore

    // exportAudienceAllButton.style = "background-color: #E6A23C; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    // resumeButton.style = "background-color: #909399; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore
    // stopButton.style = "background-color: #f44336; color: white; margin-top: 5px; width: 300px; font-size: 16px; cursor: pointer"; // prettier-ignore

    operationLeft.appendChild(collectButton);
    operationLeft.appendChild(exportPkButton);
    operationLeft.appendChild(exportAudienceAllButton);
    operationLeft.appendChild(exportNewAudienceButton);
    operationLeft.appendChild(collectAudienceAllSecUidAndUniqueIdButton);
    operationLeft.appendChild(exportGuestButton);
    operationLeft.appendChild(exportAllButton);
    operationLeft.appendChild(downloadButton);
    operationLeft.appendChild(debugButton);

    // operationLeft.appendChild(resumeButton);
    // operationLeft.appendChild(stopButton);

    // ----- 创建状态文本 -----

    setText('status', 'Running');
    setText('runtimeTime', '0小时 0分钟 0秒');

    statusText.style = "margin: 10px 0 0 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 0 5px; width: 300px;"; // prettier-ignore
    runtimeTimeText.style = "margin: 10px 0 0 0; font-size: 16px; font-weight: bold; background-color: #f0f0f0; padding: 0 5px; width: 300px;"; // prettier-ignore

    operationLeft.appendChild(statusText);
    operationLeft.appendChild(runtimeTimeText);

    // ---- 创建日志区域 -----

    logContainer.id = 'x-log-container';
    logContainer.style = "margin: 0 0 0 20px; width: 100%; height: 100%; padding: 10px; font-size: 14px; background-color: #f0f0f0; border-radius: 5px; overflow-y: auto;"; // prettier-ignore

    operationRight.appendChild(logContainer);

    //  ################################### 将操作区域添加到页面 ##################################

    operationContainer.appendChild(operationLeft);
    operationContainer.appendChild(operationRight);
    containerReplay.appendChild(operationContainer);

    // ################################### 控制显示区域 ##################################

    const showContainer = document.createElement("div"); // prettier-ignore

    const showButton = createButton("+ 显示操作区域", () => operationContainer.style.visibility = "visible"); // prettier-ignore
    const hideButton = createButton("- 隐藏操作区域", () => operationContainer.style.visibility = "hidden"); // prettier-ignore

    //  设置显示和隐藏按钮的样式
    showContainer.style.position = "fixed"; // prettier-ignore
    showContainer.style.bottom = "600px"; // prettier-ignore
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

    setOperationLog('操作区域创建完成');
  };

  // ------------------------------ 入口函数 ------------------------------

  // 清理缓存
  const clearCache = () => {
    setOperationLog('清理缓存...');
    GM_setValue(keyXhrRequests, {});
    GM_setValue(keyXhrResponses, {});
    localStorage.removeItem('x-replays');
    localStorage.removeItem('x-replays-player-map');
    setOperationLog('缓存清理完成');
  };

  // 主函数
  const main = async () => {
    try {
      interceptXHR();
      // clearCache();
      clearDisplay();
      createDisplay();

      await indexdbInstance.open();
      await indexdbInstance.upsertItem(indexdbStoreReplayDataName, {
        id: '占位空数据',
        timestamp: new Date().toISOString()
      });
      await indexdbInstance.upsertItem(indexdbStoreUserIDMapSecUidAndUniqueIdName, {
        id: '占位空数据',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      setOperationLog(`主函数执行出错: ${error.message}`);
    }
  };

  let isReplayContainerPrepared = false; // 检查 elReplayContainer 是否已经准备好

  // 执行主函数
  timerCheckDom = setInterval(() => {
    setOperationLog('检查DOM是否加载完成...');
    // 检查 elReplayContainer 是否存在
    if (document.querySelector(elReplayContainer)) {
      setOperationLog('DOM已加载，开始执行主函数');
      // 页面滚动到 elReplayContainer 的位置
      setTimeout(() => {
        setOperationLog('DOM已加载，执行页面滚动');
        document.querySelector(elReplayContainer).scrollIntoView();
      }, 2000);
      main();
      setOperationLog('DOM已经加载，开始执行主函数');
      clearInterval(timerCheckDom);
      isReplayContainerPrepared = true; // 设置标志位为true
    } else {
      isReplayContainerPrepared = false;
      setOperationLog('DOM未加载，继续等待');
    }
  }, 1000);

  //  运行时长计时器
  timerRuntime = setInterval(() => {
    if (isReplayContainerPrepared) {
      if (runtimeTime === null) {
        runtimeTime = new Date();
      }
      const currentTime = new Date();
      const elapsedTime = Math.floor((currentTime.getTime() - runtimeTime.getTime()) / 1000);
      const hours = Math.floor(elapsedTime / 3600);
      const minutes = Math.floor((elapsedTime % 3600) / 60);
      const seconds = elapsedTime % 60;
      setText('runtimeTime', `${hours}小时 ${minutes}分钟 ${seconds}秒`);
    }
  }, 1000);
})();
