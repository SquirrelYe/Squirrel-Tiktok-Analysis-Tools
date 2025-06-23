// ==UserScript==
// @name         抖音直播页面格式化
// @namespace    http://tampermonkey.net/
// @version      2024-11-29
// @description  try to take over the world!
// @author       You
// @match        https://live.douyin.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  setTimeout(() => {
    document.querySelector("#douyin-navigation").remove();
    document.querySelector("div > div > div > video").remove();
    document.querySelector("#living_room_player_container7442497165760498472").style.minWidth = "500px"; // prettier-ignore
  }, 5 * 1000);

  console.log("Douyin video initialized...");
})();
