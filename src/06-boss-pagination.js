// 不以滚动像素变化代表加载结果。BOSS 每次异步追加15个岗位；
// 到底后即使 scrollTop 不再变化，也可能还在等待下一批响应。
function getBossListLoadState(cards) {
  const seen = new Set();
  let node = cards[0];
  for (let depth = 0; node && depth < 16; depth++, node = node.parentElement) {
    let view = node.__vue__;
    for (let parent = 0; view && parent < 16 && !seen.has(view); parent++, view = view.$parent) {
      seen.add(view);
      if (Array.isArray(view.jobList) && typeof view.hasMore === "boolean" &&
          Number.isFinite(Number(view.pageVo?.page))) {
        return { known: true, hasMore: view.hasMore,
          loading: Boolean(view.loading || view.moreLoading), page: Number(view.pageVo.page) };
      }
    }
  }
  return { known: false, hasMore: null, loading: null, page: null };
}

function getBossPaginationSnapshot() {
  const cards = getBossJobCardElements();
  const jobs = cards.map((card, index) => buildBossJobDetail(card, index)).filter(Boolean);
  return {
    cards, cardCount: cards.length,
    ids: new Set(jobs.map((job) => job.encryptJobId || `${job.jobName}|${job.brandName}`)),
    pending: jobs.filter((job) => !state.processedKeys.has(getJobUniqueKey(job))).length,
    ...getBossListLoadState(cards),
  };
}

function bossPaginationLabel(snapshot) {
  return `卡片${snapshot.cardCount}，待处理${snapshot.pending}，平台页${snapshot.page ?? "未知"}，hasMore=${snapshot.hasMore ?? "未知"}，加载中=${snapshot.loading ?? "未知"}`;
}

function triggerBossListScroll(snapshot) {
  const targets = new Set();
  let node = snapshot.cards[0]?.parentElement;
  for (let depth = 0; node && depth < 16; depth++, node = node.parentElement) {
    const overflow = window.getComputedStyle(node).overflowY;
    if (node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2 && /auto|scroll/.test(overflow)) targets.add(node);
  }
  const page = document.scrollingElement || document.documentElement;
  if (page) targets.add(page);
  for (const target of targets) {
    const isPage = target === page;
    if (isPage) {
      window.scrollTo({ top: target.scrollHeight, behavior: "auto" });
      // 已到底时 scrollTo 不会触发新事件，仍需让站点原生加载器检查 hasMore。
      window.dispatchEvent(new window.Event("scroll"));
    } else {
      target.scrollTo({ top: target.scrollHeight, behavior: "auto" });
      target.dispatchEvent(new window.Event("scroll"));
    }
  }
}

function getBossNextPageButton() {
  const icon = document.querySelector('.options-pages .ui-icon-arrow-right, .pagination .ui-icon-arrow-right, .page-next');
  const button = icon?.closest("button, a, li, .btn, .page-next") || icon?.parentElement;
  return button && !isDisabled(button) ? button : null;
}

async function goBossNextPageOrScroll({ probe = false } = {}) {
  state.paginationStopReason = "";
  const before = getBossPaginationSnapshot();
  const hasWork = (snapshot) => probe
    ? [...snapshot.ids].some((id) => !before.ids.has(id)) : snapshot.pending > 0;
  if (!probe && hasWork(before)) {
    log("info", `翻页前已发现待处理岗位，继续处理：${bossPaginationLabel(before)}`);
    return true;
  }
  const nextButton = !before.known && getBossNextPageButton();
  if (nextButton) nextButton.click();
  let endStable = 0;
  let last = before;
  // 最多等待30秒；没有新增且状态不明时明确暂停，不假报“没有更多”。
  for (let poll = 0; poll < 60; poll++) {
    if (state.stopping) return false;
    last = getBossPaginationSnapshot();
    if (hasWork(last)) {
      log("success", `下一批岗位已加载：卡片${before.cardCount}→${last.cardCount}；${bossPaginationLabel(last)}`);
      return true;
    }
    if (last.known && !last.loading && last.hasMore === false) {
      if (++endStable >= 4) {
        state.paginationStopReason = "当前筛选列表已加载完（平台确认无更多岗位）";
        log("info", `翻页结束依据：${bossPaginationLabel(last)}，连续确认平台 hasMore=false`);
        return false;
      }
    } else {
      endStable = 0;
      if (!nextButton && poll % 20 === 0 && !last.loading) {
        triggerBossListScroll(last);
        log("info", `等待加载更多（第${Math.floor(poll / 20) + 1}次检查）：${bossPaginationLabel(last)}`);
      }
    }
    await sleep(500);
  }
  state.paginationStopReason = last.known && last.hasMore
    ? "平台仍有更多岗位，但加载超时，已暂停（可稍后继续）"
    : "暂未加载到新岗位，未能确认列表结束（可稍后继续）";
  log("warn", `${state.paginationStopReason}；${bossPaginationLabel(last)}`);
  return false;
}

async function probeBossPagination() {
  if (state.running || state.previewing) return;
  state.previewing = true; state.stopping = false;
  state.current = "只读检查列表加载，不投递"; renderPanel();
  try {
    const loaded = await goBossNextPageOrScroll({ probe: true });
    state.current = loaded ? "已加载更多岗位，未投递" : state.paginationStopReason;
  } catch (error) { state.current = "列表加载检查失败，未投递"; log("warn", `${state.current}：${error.message || error}`); }
  finally { state.previewing = false; renderPanel(); }
}
