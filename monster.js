(async function () {
  "use strict";

  const CONFIG = {
    DEFAULT_INTERVAL_MS: 5000,
    MIN_INTERVAL_MS: 1000,
    MAX_INTERVAL_MS: 5000,
    INTERVAL_STEP_MS: 500,
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 5000,
    REQUEST_TIMEOUT_MS: 30000,
    MAX_PAGES: 1000,
    FILE_PREFIX: "monsters_",
    BOX_ID: "dqx-monster-exporter",
  };

  const TARGET_ORIGIN = "https://hiroba.dqx.jp";
  const TARGET_PATH = "/sc/senreki/monster/";

  if (
    location.origin !== TARGET_ORIGIN ||
    !location.pathname.startsWith(TARGET_PATH)
  ) {
    alert(
      "「討伐モンスターリスト」に移動してから、" +
        "再度ブックマークレットを実行してください。"
    );
    return;
  }

  const previous = window.__dqxMonsterExporter;

  if (previous && !previous.finished) {
    alert("すでにモンスターリストを取得中です。");
    return;
  }

  const state = {
    stopped: false,
    finished: false,
    running: false,
    controller: null,
    monsters: new Map(),
    processed: 0,
    total: 0,
    errors: [],
    lastRequestAt: 0,
    intervalMs: CONFIG.DEFAULT_INTERVAL_MS,
  };

  window.__dqxMonsterExporter = state;

  const oldBox = document.getElementById(CONFIG.BOX_ID);
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.id = CONFIG.BOX_ID;
  box.style.cssText = [
    "margin:20px 0",
    "padding:20px",
    "background:#fff",
    "color:#222",
    "border:2px solid #4b8bba",
    "border-radius:8px",
    "box-shadow:0 2px 8px rgba(0,0,0,.12)",
    "font-size:14px",
    "line-height:1.7",
  ].join(";");

  const heading = document.createElement("h2");
  heading.textContent = "討伐モンスターリスト CSV出力";
  heading.style.cssText = "margin:0 0 12px;font-size:18px";

  // 通信間隔設定UI
  const intervalBox = document.createElement("div");
  intervalBox.style.cssText = [
    "padding:12px",
    "margin-bottom:14px",
    "background:#f3f7fa",
    "border:1px solid #ccd9e2",
    "border-radius:6px",
  ].join(";");

  const intervalLabel = document.createElement("label");
  intervalLabel.textContent = "通信間隔：";
  intervalLabel.style.fontWeight = "bold";

  const intervalInput = document.createElement("input");
  intervalInput.type = "number";
  intervalInput.min = String(CONFIG.MIN_INTERVAL_MS);
  intervalInput.max = String(CONFIG.MAX_INTERVAL_MS);
  intervalInput.step = String(CONFIG.INTERVAL_STEP_MS);
  intervalInput.value = String(state.intervalMs);
  intervalInput.style.cssText = [
    "width:85px",
    "padding:5px",
    "margin:0 6px",
    "font-size:14px",
    "box-sizing:border-box",
  ].join(";");

  const intervalUnit = document.createElement("span");
  intervalUnit.textContent = "ミリ秒";

  const intervalSlider = document.createElement("input");
  intervalSlider.type = "range";
  intervalSlider.min = String(CONFIG.MIN_INTERVAL_MS);
  intervalSlider.max = String(CONFIG.MAX_INTERVAL_MS);
  intervalSlider.step = String(CONFIG.INTERVAL_STEP_MS);
  intervalSlider.value = String(state.intervalMs);
  intervalSlider.style.cssText = [
    "display:block",
    "width:100%",
    "margin:12px 0 6px",
  ].join(";");

  const intervalDescription = document.createElement("div");
  intervalDescription.textContent =
    "1000〜5000ミリ秒（500ミリ秒刻み）" + "・取得中も変更できます。";
  intervalDescription.style.cssText = "font-size:12px;color:#555";

  intervalLabel.append(intervalInput, intervalUnit);

  intervalBox.append(intervalLabel, intervalSlider, intervalDescription);

  function normalizeInterval(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return state.intervalMs;
    }

    const clamped = Math.min(
      CONFIG.MAX_INTERVAL_MS,
      Math.max(CONFIG.MIN_INTERVAL_MS, number)
    );

    return (
      Math.round(clamped / CONFIG.INTERVAL_STEP_MS) * CONFIG.INTERVAL_STEP_MS
    );
  }

  function setIntervalMs(value) {
    const normalized = normalizeInterval(value);

    state.intervalMs = normalized;
    intervalInput.value = String(normalized);
    intervalSlider.value = String(normalized);
  }

  intervalSlider.addEventListener("input", () => {
    setIntervalMs(intervalSlider.value);
  });

  intervalInput.addEventListener("change", () => {
    setIntervalMs(intervalInput.value);
  });

  intervalInput.addEventListener("blur", () => {
    setIntervalMs(intervalInput.value);
  });

  const status = document.createElement("div");
  status.textContent = "取得開始を待っています。";

  const progress = document.createElement("progress");
  progress.max = 1;
  progress.value = 0;
  progress.style.cssText = "width:100%;height:18px;margin:12px 0";

  const detail = document.createElement("div");
  detail.textContent = "取得件数: 0";

  const buttonBox = document.createElement("div");
  buttonBox.style.cssText =
    "display:flex;gap:10px;flex-wrap:wrap;margin:12px 0";

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "取得開始";

  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.textContent = "取得を中断";
  stopButton.disabled = true;

  for (const button of [startButton, stopButton]) {
    button.style.cssText = [
      "padding:8px 16px",
      "cursor:pointer",
      "border:1px solid #999",
      "border-radius:4px",
      "background:#f5f5f5",
      "color:#222",
    ].join(";");
  }

  startButton.style.background = "#2475ad";
  startButton.style.color = "#fff";
  startButton.style.borderColor = "#2475ad";

  buttonBox.append(startButton, stopButton);

  const result = document.createElement("div");
  result.style.marginTop = "12px";

  box.append(heading, intervalBox, status, progress, detail, buttonBox, result);

  const contentArea =
    document.querySelector("#contentArea") ||
    document.querySelector("main") ||
    document.body;

  contentArea.prepend(box);

  function setStatus(message) {
    status.textContent = message;
  }

  function updateProgress() {
    progress.max = Math.max(state.total, 1);
    progress.value = Math.min(state.processed, progress.max);

    detail.textContent =
      "処理ページ: " +
      state.processed +
      " / " +
      state.total +
      "　取得件数: " +
      state.monsters.size +
      "　エラー: " +
      state.errors.length +
      "　通信間隔: " +
      state.intervalMs +
      "ms";
  }

  function extractMonsterId(url) {
    const match = String(url ?? "").match(/\/monster\/([^/?#]+)/);

    return match ? match[1] : "";
  }

  function toNumber(value) {
    const digits = String(value ?? "").replace(/[^\d]/g, "");

    return digits ? Number(digits) : 0;
  }

  function getMonstersFromHtml(doc) {
    const items = [];

    const rows = doc.querySelectorAll("table.senreki-table tr");

    for (const row of rows) {
      const cells = row.querySelectorAll("td");

      if (cells.length < 6) continue;

      const link = cells[2].querySelector("a");
      if (!link) continue;

      const id = extractMonsterId(
        link.getAttribute("data-url") || link.getAttribute("href") || ""
      );

      if (!id) continue;

      const firstClass = cells[0].classList;

      const monster = {
        id,
        name: cells[2].textContent.trim(),
        count: toNumber(cells[1].textContent),
        exp: toNumber(cells[3].textContent),
        stamp: toNumber(cells[4].textContent),
        gold: toNumber(cells[5].textContent),

        isScanned: link.classList.contains("mon-name-scanned"),

        isDefeatTarget: !firstClass.contains("defeat-none-ico"),

        isCrowned: firstClass.contains("defeat-crown-ico"),
      };

      items.push(monster);
    }

    return items;
  }

  function addMonsters(items) {
    for (const monster of items) {
      if (!state.monsters.has(monster.id)) {
        state.monsters.set(monster.id, monster);
      }
    }
  }

  function getPageUrls() {
    const lastLink = document.querySelector("li.last a.pagerBottom");

    if (!lastLink) {
      return [location.href];
    }

    const lastUrl = new URL(lastLink.getAttribute("href"), location.href);

    if (
      lastUrl.origin !== TARGET_ORIGIN ||
      !lastUrl.pathname.startsWith(TARGET_PATH)
    ) {
      throw new Error("ページ送りURLが不正です。");
    }

    const match = lastUrl.pathname.match(/^(.*\/)(\d+)\/?$/);

    if (!match) {
      throw new Error("最終ページ番号を取得できませんでした。");
    }

    const lastIndex = Number(match[2]);

    if (
      !Number.isSafeInteger(lastIndex) ||
      lastIndex < 0 ||
      lastIndex >= CONFIG.MAX_PAGES
    ) {
      throw new Error("ページ数が許容範囲外です。");
    }

    const urls = [];

    for (let i = 0; i <= lastIndex; i++) {
      const url = new URL(lastUrl.href);
      url.pathname = match[1] + i;
      urls.push(url.href);
    }

    return urls;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitWithStop(ms) {
    const end = Date.now() + ms;

    while (Date.now() < end) {
      if (state.stopped) {
        throw new Error("STOPPED");
      }

      await sleep(Math.min(200, Math.max(0, end - Date.now())));
    }
  }

  // 取得中の設定変更を反映する通常通信待機
  async function waitForInterval() {
    while (true) {
      if (state.stopped) {
        throw new Error("STOPPED");
      }

      const elapsed = Date.now() - state.lastRequestAt;

      const remaining = state.intervalMs - elapsed;

      if (state.lastRequestAt === 0 || remaining <= 0) {
        return;
      }

      setStatus(
        "次の通信まで " +
          (remaining / 1000).toFixed(1) +
          " 秒待機中..." +
          "（設定: " +
          state.intervalMs +
          "ms）"
      );

      await sleep(Math.min(100, remaining));
    }
  }

  async function fetchPage(url) {
    for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      if (state.stopped) {
        throw new Error("STOPPED");
      }

      await waitForInterval();

      const controller = new AbortController();
      state.controller = controller;

      const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.REQUEST_TIMEOUT_MS
      );

      state.lastRequestAt = Date.now();

      try {
        setStatus(
          "ページ取得中..." +
            (attempt > 0
              ? "（再試行 " + attempt + "/" + CONFIG.MAX_RETRIES + "）"
              : "")
        );

        const response = await fetch(url, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
          redirect: "follow",
          cache: "no-store",
        });

        const finalUrl = new URL(response.url);

        if (
          finalUrl.origin !== TARGET_ORIGIN ||
          !finalUrl.pathname.startsWith(TARGET_PATH)
        ) {
          throw new Error(
            "想定外のページへ移動しました。" +
              "ログイン状態を確認してください。"
          );
        }

        if (!response.ok) {
          const error = new Error("HTTP " + response.status);
          error.status = response.status;
          throw error;
        }

        const html = await response.text();

        const doc = new DOMParser().parseFromString(html, "text/html");

        if (!doc.querySelector("table.senreki-table")) {
          throw new Error("モンスター一覧が見つかりません。");
        }

        return doc;
      } catch (error) {
        if (state.stopped) {
          throw new Error("STOPPED");
        }

        const retryable =
          error.name === "AbortError" ||
          error.name === "TypeError" ||
          [429, 500, 502, 503, 504].includes(error.status);

        if (!retryable || attempt >= CONFIG.MAX_RETRIES) {
          throw error;
        }

        const delay = CONFIG.RETRY_BASE_MS * Math.pow(2, attempt);

        setStatus(
          "通信エラー: " +
            error.message +
            "。" +
            Math.ceil(delay / 1000) +
            "秒後に再試行します..."
        );

        await waitWithStop(delay);
      } finally {
        clearTimeout(timeout);

        if (state.controller === controller) {
          state.controller = null;
        }
      }
    }

    throw new Error("ページ取得に失敗しました。");
  }

  function csvEscape(value) {
    const text = String(value ?? "");

    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
  }

  function createCsv() {
    const headers = [
      ["name", "モンスター名"],
      ["count", "討伐数"],
      ["exp", "経験値"],
      ["stamp", "特訓スタンプ"],
      ["gold", "ゴールド"],
      ["isScanned", "みやぶる"],
      ["isDefeatTarget", "100匹討伐対象"],
      ["id", "モンスターID"],
    ];

    const lines = [headers.map((h) => csvEscape(h[1])).join(",")];

    for (const monster of state.monsters.values()) {
      const values = headers.map(([key]) => {
        let value = monster[key];

        if (key === "isScanned") {
          value = value ? "済" : "未";
        } else if (key === "isDefeatTarget") {
          value = value ? "討伐対象" : "";
        }

        return csvEscape(value);
      });

      lines.push(values.join(","));
    }

    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  function createFileName() {
    const d = new Date();

    const date =
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");

    return CONFIG.FILE_PREFIX + date + ".csv";
  }

  function showResult() {
    const csv = createCsv();
    const fileName = createFileName();

    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.value = csv;
    textarea.style.cssText = [
      "width:100%",
      "height:240px",
      "box-sizing:border-box",
      "margin:12px 0",
      "font-family:monospace",
    ].join(";");

    const downloadButton = document.createElement("button");

    downloadButton.type = "button";
    downloadButton.textContent = fileName + " をダウンロード";

    downloadButton.style.cssText = [
      "padding:10px 18px",
      "cursor:pointer",
      "background:#2475ad",
      "color:white",
      "border:0",
      "border-radius:4px",
    ].join(";");

    downloadButton.addEventListener("click", () => {
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = fileName;

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    result.replaceChildren(textarea, downloadButton);
  }

  async function run() {
    if (state.running || state.finished) return;

    state.running = true;
    startButton.disabled = true;
    stopButton.disabled = false;

    try {
      const urls = getPageUrls();
      state.total = urls.length;

      updateProgress();

      if (urls.length === 1) {
        setStatus("現在のページを解析中...");

        addMonsters(getMonstersFromHtml(document));

        state.processed = 1;
        updateProgress();
      } else {
        for (let i = 0; i < urls.length; i++) {
          if (state.stopped) break;

          try {
            const doc = await fetchPage(urls[i]);

            addMonsters(getMonstersFromHtml(doc));
          } catch (error) {
            if (state.stopped) break;

            state.errors.push({
              page: i + 1,
              url: urls[i],
              message: error.message,
            });
          }

          state.processed++;
          updateProgress();
        }
      }

      if (state.stopped) {
        setStatus("取得を中断しました。" + "取得済みデータを出力できます。");
      } else if (state.errors.length > 0) {
        setStatus(
          "一部のページでエラーが発生しました。" +
            "取得済みデータを出力できます。"
        );
      } else {
        setStatus("すべてのページの取得が完了しました。");
      }

      if (state.monsters.size > 0) {
        showResult();
      } else {
        setStatus("モンスターデータを取得できませんでした。");
      }

      if (state.errors.length > 0) {
        const errorTitle = document.createElement("p");

        errorTitle.textContent =
          "取得失敗ページ: " + state.errors.length + "件";

        const errorList = document.createElement("ul");

        for (const error of state.errors) {
          const li = document.createElement("li");

          li.textContent = "ページ " + error.page + ": " + error.message;

          errorList.appendChild(li);
        }

        result.append(errorTitle, errorList);
      }
    } catch (error) {
      if (state.stopped) {
        setStatus("処理を中断しました。");

        if (state.monsters.size > 0) {
          showResult();
        }
      } else {
        setStatus("エラー: " + error.message);

        console.error("[DQX Monster Exporter]", error);
      }
    } finally {
      state.finished = true;
      state.running = false;
      state.controller = null;

      startButton.disabled = true;
      stopButton.disabled = true;
      stopButton.textContent = "処理終了";

      updateProgress();
    }
  }

  startButton.addEventListener("click", () => {
    setIntervalMs(intervalInput.value);
    void run();
  });

  stopButton.addEventListener("click", () => {
    if (state.finished || state.stopped || !state.running) {
      return;
    }

    state.stopped = true;
    setStatus("中断処理中...");

    if (state.controller) {
      state.controller.abort();
    }
  });

  updateProgress();
})();
