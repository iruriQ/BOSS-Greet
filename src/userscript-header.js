// ==UserScript==
// @name         BOSS 岗位定制招呼助手
// @namespace    local.boss-auto-apply.custom
// @version      0.6.1
// @description  按规则投递；Boss 根据真实经历和岗位 JD 生成专属招呼语，逐条校对错别字、语序、用词及事实后自动发送。
// @author       iruriQ (based on plove / muyuniao)
// @homepageURL  https://github.com/iruriQ/BOSS-Greet
// @supportURL   https://github.com/iruriQ/BOSS-Greet/issues
// @license      MIT
// @match        https://www.zhipin.com/web/geek/job*
// @match        https://www.zhipin.com/web/geek/jobs*
// @match        https://www.zhipin.com/web/geek/job-recommend*
// @match        https://www.zhipin.com/web/geek/overseas*
// @match        https://www.liepin.com/zhaopin*
// @match        https://sou.zhaopin.com/*
// @match        https://www.zhaopin.com/sou*
// @match        https://www.zhaopin.com/jobs*
// @match        https://*.zhaopin.com/*
// @match        https://we.51job.com/pc/search*
// @match        https://www.shixiseng.com/interns*
// @match        https://resume.shixiseng.com/interns*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      *
// @grant        unsafeWindow
// ==/UserScript==
