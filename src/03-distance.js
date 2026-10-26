// BOSS 的岗位地图使用高德坐标（GCJ-02）。只比较同坐标系的明确地点，
// 不将“我的位置”、商圈中心或未标明起点的 distance 字段当成家庭距离。
function normalizeBossPoint(value) {
  if (!value || typeof value !== "object") return null;
  const lon = value.longitude;
  const lat = value.latitude;
  if (![lon, lat].every((part) =>
    (typeof part === "number" || typeof part === "string") && String(part).trim() !== "")) return null;
  const longitude = Number(lon), latitude = Number(lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      longitude < 73 || longitude > 136 || latitude < 3 || latitude > 54) return null;
  return { longitude, latitude };
}

function bossStraightDistanceKm(start, end) {
  const a = normalizeBossPoint(start), b = normalizeBossPoint(end);
  if (!a || !b) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude);
  const square = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) *
    Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, square))));
}

function getBossWorkPoint(job, detail) {
  // jobInfo 是详情页实际展示的工作地址；gps 是 BOSS 地图岗位的原始坐标。
  // 不读取公司总部或其他工作地址，以免把别处的岗位判为附近。
  for (const item of [detail?.jobInfo, detail?.jobCard?.jobInfo, detail?.jobCard,
    detail, job?.raw?.jobInfo, job?.raw?.gps]) {
    const point = normalizeBossPoint(item);
    if (point) return point;
  }
  return null;
}

function validateBossDistanceConfig(settings = config) {
  if (!settings.bossDistanceEnabled) return;
  if (!normalizeBossPoint(settings.bossHomeLocation) || settings.bossHomeLocation?.coordinateSystem !== "gcj02") {
    throw new Error("请先同步家庭位置，不能使用当前位置代替家庭位置");
  }
  const max = settings.bossMaxDistanceKm;
  if (!Number.isFinite(max) || max < 0.1 || max > 200) {
    throw new Error("距家上限需填写 0.1 至 200 公里");
  }
}

function filterBossHomeDistance(job, detail, settings = config) {
  if (!settings.bossDistanceEnabled) return { ok: true, reason: "" };
  try { validateBossDistanceConfig(settings); } catch (error) {
    return { ok: false, reason: error.message };
  }
  const point = getBossWorkPoint(job, detail);
  if (!point) return { ok: false, reason: "无法确认工作地址坐标，已按距家筛选规则跳过" };
  const distanceKm = bossStraightDistanceKm(settings.bossHomeLocation, point);
  const ok = distanceKm <= settings.bossMaxDistanceKm;
  return { ok, distanceKm, reason: ok ? "" :
    `距家直线距离 ${distanceKm.toFixed(2)} 公里，超过 ${settings.bossMaxDistanceKm} 公里上限` };
}

function isBossHomeSetupPage() {
  return location.hostname === "www.zhipin.com" && /^\/web\/geek\/map\/path\/?$/.test(new URL(location.href).pathname);
}

function openBossHomeSetup() {
  const adapter = getAdapter();
  const job = adapter?.getCards().map((card, index) => adapter.buildJob(card, index)).find((item) => item?.securityId);
  if (!job) { log("warn", "请先在 BOSS 职位列表中打开一个岗位，再设置家庭起点"); return; }
  const params = new URLSearchParams({ securityId: job.securityId });
  // BOSS 原生路线页只允许同站 iframe 显示，因此保留其正常嵌入方式。
  if (document.getElementById(`${APP_ID}-home-map`)) return;
  const overlay = document.createElement("div");
  overlay.id = `${APP_ID}-home-map`;
  overlay.style.cssText = "position:fixed;inset:20px;z-index:2147483647;background:white;border:2px solid #14b8a6;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 10px 50px #0006;";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "padding:12px;display:flex;gap:12px;align-items:center;font:14px sans-serif;flex-wrap:wrap;";
  const help = document.createElement("span");
  help.textContent = "在地图左侧搜索与 App 相同的家庭地标并选中，再同步。";
  const sync = document.createElement("button"); sync.textContent = "同步当前起点为家庭位置";
  const close = document.createElement("button"); close.textContent = "返回岗位列表";
  const status = document.createElement("span"); status.setAttribute("role", "status");
  toolbar.append(help, sync, close, status);
  const frame = document.createElement("iframe");
  frame.title = "BOSS 家庭起点选择";
  frame.src = `/web/geek/map/path?${params}`;
  frame.style.cssText = "width:100%;flex:1;border:0;min-height:0;";
  overlay.append(toolbar, frame);
  sync.addEventListener("click", () => {
    try {
      const href = new URL(frame.contentWindow.location.href);
      if (href.origin !== location.origin || href.pathname !== "/web/geek/map/path") throw new Error("地图地址尚未确认");
      syncBossHomeFromRoute(frame.contentDocument);
      status.textContent = `已同步：${config.bossHomeLocation.name}`;
    } catch (error) { status.textContent = error.message || "地图尚未加载，请稍后再试"; }
  });
  close.addEventListener("click", () => {
    overlay.remove();
    if (cachedPanel) cachedPanel.style.display = "";
    config = loadConfig(); renderPanel();
  });
  if (cachedPanel) cachedPanel.style.display = "none";
  document.body.appendChild(overlay);
}

function syncBossHomeFromRoute(routeDocument = document) {
  if (routeDocument === document && !isBossHomeSetupPage()) throw new Error("请先打开 BOSS 路线规划页面并选择家庭起点");
  for (const node of routeDocument.querySelectorAll(".path-plan-search")) {
    const view = node.__vue__;
    const start = view?.startAddress || view?.$data?.startAddress;
    const name = normalizeText(start?.name);
    const visible = normalizeText(node.querySelector(".start-point-text")?.textContent);
    const point = normalizeBossPoint(start);
    if (!point || !name || visible !== name || /我的位置|当前位置|请选择/.test(name)) continue;
    config = loadConfig();
    saveConfig({ ...config, bossHomeLocation: { ...point, coordinateSystem: "gcj02", name } });
    log("success", "已同步所选家庭起点。返回岗位列表，刷新家庭位置并设置距家公里数即可。");
    return;
  }
  throw new Error("请在 BOSS 地图左侧搜索家庭附近地标，并点击候选结果；不能用“我的位置”代替家庭位置");
}
