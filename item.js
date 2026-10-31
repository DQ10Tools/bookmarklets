(async () => {
  "use strict";

  const SITE = "https://hiroba.dqx.jp";
  const BOX_ID = "dq10-item-exporter";
  const MAX_RETRIES = 3;
  const MAX_DELAY = 60000;
  const REQUEST_TIMEOUT = 20000;

  if (location.origin !== SITE) {
    alert("冒険者の広場で実行してください。");
    return;
  }

  if (document.getElementById(BOX_ID)) {
    alert("すでに起動しています。");
    return;
  }

  // カテゴリ定義
  const groups = [
    {
      name: "武器",
      entries: [
        ["片手剣", "初心者用の片手剣"],
        ["両手剣", "初心者用の両手剣"],
        ["短剣", "初心者用の短剣"],
        ["スティック", "初心者用スティック"],
        ["両手杖", "初心者用の両手杖"],
        ["ヤリ", "初心者用のやり"],
        ["オノ", "初心者用のオノ"],
        ["棍", "初心者用のこん"],
        ["ツメ", "初心者用のツメ"],
        ["ムチ", "初心者用のムチ"],
        ["扇", "初心者用のおうぎ"],
        ["ハンマー", "こんぼう"],
        ["ブーメラン", "初心者用ブーメラン"],
        ["弓", "青竹の弓"],
        ["鎌", "さばきの鎌"],
      ],
    },
    {
      name: "防具",
      entries: [
        ["盾", "皮の盾"],
        ["アタマ", "皮のぼうし"],
        ["からだ上", "皮のよろい"],
        ["からだ下", "皮のズボン"],
        ["ウデ", "皮のてぶくろ"],
        ["足", "皮のくつ"],
      ],
    },
    {
      name: "アクセサリー",
      entries: [
        ["顔アクセサリー", "スライムピアス"],
        ["首アクセサリー", "ちょうネクタイ"],
        ["指アクセサリー", "きんのゆびわ"],
        ["胸アクセサリー", "セルケトのブローチ"],
        ["腰アクセサリー", "おしゃれなベルト"],
        ["札アクセサリー", "しんぴのカード"],
        ["その他のアクセ", "うさぎのおまもり"],
        ["職業の証", "戦士の証"],
        ["紋章", "はじまりの紋章"],
        ["キャラのこころ", "こころの器"],
      ],
    },
    {
      name: "職人どうぐ",
      entries: [
        ["鍛冶ハンマー", "銅の鍛冶ハンマー"],
        ["さいほう針", "銅のさいほう針"],
        ["木工刀", "銅の木工刀"],
        ["錬金ランプ", "銅の錬金ランプ"],
        ["錬金ツボ", "銅の錬金ツボ"],
        ["フライパン", "銅のフライパン"],
      ],
    },
    {
      name: "釣りどうぐ",
      entries: [
        ["釣りざお", "じょうぶな釣りざお"],
        ["ルアー", "ぎんのルアー"],
      ],
    },
    {
      name: "かさ",
      entries: [["かさ", "赤い傘"]],
    },
    {
      name: "消費アイテム",
      entries: [
        ["どうぐ", "やくそう"],
        ["料理", "クイックケーキ"],
        ["つばさ", "お招きのつばさ"],
        ["便せん", "無地の便せん"],
        ["レシピ帳", "はじめての武器鍛冶"],
        ["しぐさ書", "しぐさ書・まわる"],
        ["ポーズ書", "ポーズ書・もののふ"],
        ["スカウトの書", "スライムの書"],
        ["運命のカード", "アトラスカード"],
        ["依頼書", "依頼書"],
      ],
    },
    {
      name: "素材",
      entries: [
        ["素材", "どうのこうせき"],
        ["タネ", "レッドローズのタネ"],
      ],
    },
    {
      name: "ハウジング",
      entries: [
        ["家キット", "四角い家"],
        ["家具", "白木の間仕切り"],
        ["庭具", "カカシつきの畑"],
      ],
    },
  ];

  const NORMAL_KEYS = [
    "アイテム名",
    "カテゴリ",
    "装備可能レベル",
    "装備できる職業",
  ];

  const DETAIL_KEYS = [
    "基本こうげき力",
    "基本しゅび力",
    "基本すばやさ",
    "基本きようさ",
    "基本おしゃれさ",
    "基本おもさ",
    "説明",
  ];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const state = {
    running: false,
    stopped: false,
    mode: 1,
    delay: 5000,
    minDelay: 5000,
    queue: [],
    queued: new Set(),
    visited: new Set(),
    items: new Map(),
    failures: [],
    requests: 0,
    controller: null,
    abortWait: null,
    currentUrl: "",
  };

  // UI作成
  const box = document.createElement("section");
  box.id = BOX_ID;
  box.style.cssText = `
    position:relative;
    z-index:9999;
    background:#fff;
    color:#222;
    border:2px solid #5577aa;
    padding:18px;
    margin:15px auto;
    max-width:1000px;
    font:14px/1.6 sans-serif;
    box-sizing:border-box;
  `;

  const root = document.querySelector("#contentArea") || document.body;

  root.prepend(box);

  const title = document.createElement("h2");
  title.textContent = "DQ10 アイテムCSV取得ツール";
  box.append(title);

  const form = document.createElement("form");
  box.append(form);

  const modeField = document.createElement("fieldset");
  const modeLegend = document.createElement("legend");
  modeLegend.textContent = "取得モード";
  modeField.append(modeLegend);

  [
    [1, "通常モード（一覧情報）"],
    [2, "詳細モード（個別ページも取得）"],
  ].forEach(([value, label]) => {
    const wrapper = document.createElement("label");
    wrapper.style.marginRight = "18px";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "dq-mode";
    input.value = value;
    input.checked = value === 1;

    wrapper.append(input, document.createTextNode(label));
    modeField.append(wrapper);
  });

  form.append(modeField);

  const delayField = document.createElement("p");
  const delayLabel = document.createElement("label");
  delayLabel.textContent = "通信完了後の待機時間（ミリ秒）: ";

  const delayInput = document.createElement("input");
  delayInput.type = "number";
  delayInput.min = "1000";
  delayInput.max = "60000";
  delayInput.step = "500";
  delayInput.value = "5000";
  delayInput.style.width = "100px";

  delayLabel.append(delayInput);
  delayField.append(delayLabel);
  form.append(delayField);

  const categoryFields = [];

  for (const group of groups) {
    const fieldset = document.createElement("fieldset");
    fieldset.style.cssText = "margin:8px 0;padding:8px;border:1px solid #aaa";

    const legend = document.createElement("legend");
    const groupLabel = document.createElement("label");
    const groupCheckbox = document.createElement("input");

    groupCheckbox.type = "checkbox";
    groupLabel.append(groupCheckbox, document.createTextNode(" " + group.name));
    legend.append(groupLabel);
    fieldset.append(legend);

    const children = [];

    for (const [category, item] of group.entries) {
      const label = document.createElement("label");
      label.style.cssText = "display:inline-block;min-width:160px;margin:3px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.item = item;
      checkbox.dataset.category = category;

      label.append(checkbox, document.createTextNode(" " + category));

      fieldset.append(label);
      children.push(checkbox);
    }

    groupCheckbox.addEventListener("change", () => {
      children.forEach((c) => {
        c.checked = groupCheckbox.checked;
      });
      groupCheckbox.indeterminate = false;
    });

    children.forEach((c) => {
      c.addEventListener("change", () => {
        const count = children.filter((x) => x.checked).length;
        groupCheckbox.checked = count === children.length;
        groupCheckbox.indeterminate = count > 0 && count < children.length;
      });
    });

    categoryFields.push(...children);
    form.append(fieldset);
  }

  const controls = document.createElement("div");
  controls.style.margin = "12px 0";

  function makeButton(text, parent, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.cssText = "padding:7px 14px;margin:3px;cursor:pointer";
    button.addEventListener("click", handler);
    parent.append(button);
    return button;
  }

  makeButton("全選択", controls, () => {
    categoryFields.forEach((c) => (c.checked = true));
    form
      .querySelectorAll("fieldset legend input[type=checkbox]")
      .forEach((c) => {
        c.checked = true;
        c.indeterminate = false;
      });
  });

  makeButton("全解除", controls, () => {
    categoryFields.forEach((c) => (c.checked = false));
    form
      .querySelectorAll("fieldset legend input[type=checkbox]")
      .forEach((c) => {
        c.checked = false;
        c.indeterminate = false;
      });
  });

  const startButton = makeButton("取得開始", controls, start);

  const stopButton = makeButton("停止", controls, stop);

  stopButton.disabled = true;
  form.append(controls);

  const status = document.createElement("pre");
  status.style.cssText = `
    background:#f3f5f8;
    color:#222;
    padding:12px;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
  `;
  status.textContent = "待機中";
  box.append(status);

  const output = document.createElement("div");
  box.append(output);

  function updateStatus(message = "") {
    status.textContent = [
      message,
      `取得アイテム: ${state.items.size}`,
      `取得済みページ: ${state.visited.size}`,
      `待機URL: ${state.queue.length}`,
      `通信回数: ${state.requests}`,
      `失敗: ${state.failures.length}`,
      `現在の待機時間: ${state.delay}ms`,
      state.currentUrl ? `処理中: ${state.currentUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function normalizeUrl(href, base = SITE + "/") {
    if (!href) return null;

    try {
      const url = new URL(href, base);

      if (url.origin !== SITE) return null;
      if (url.protocol !== "https:") return null;

      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function enqueue(href, base, front = false) {
    const url = normalizeUrl(href, base);
    if (!url) return;

    if (state.queued.has(url) || state.visited.has(url)) {
      return;
    }

    state.queued.add(url);

    if (front) {
      state.queue.unshift(url);
    } else {
      state.queue.push(url);
    }
  }

  function stop() {
    state.stopped = true;
    state.controller?.abort();
    state.abortWait?.();
    updateStatus("停止要求を受け付けました");
  }

  function wait(ms) {
    return new Promise((resolve) => {
      if (state.stopped) {
        resolve();
        return;
      }

      let timer;

      const finish = () => {
        clearTimeout(timer);
        if (state.abortWait === finish) {
          state.abortWait = null;
        }
        resolve();
      };

      state.abortWait = finish;
      timer = setTimeout(finish, ms);
    });
  }

  async function fetchDocument(url) {
    let backoff = state.delay;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (state.stopped) {
        throw new Error("停止");
      }

      const controller = new AbortController();
      state.controller = controller;

      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        state.requests++;

        const response = await fetch(url, {
          credentials: "same-origin",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept: "text/html",
          },
        });

        if (response.status === 429 || response.status === 503) {
          let retryMs = backoff;
          const retryAfter = response.headers.get("Retry-After");

          if (retryAfter) {
            const seconds = Number(retryAfter);

            if (Number.isFinite(seconds)) {
              retryMs = Math.max(retryMs, seconds * 1000);
            } else {
              const date = Date.parse(retryAfter);
              if (!Number.isNaN(date)) {
                retryMs = Math.max(retryMs, date - Date.now());
              }
            }
          }

          if (attempt === MAX_RETRIES) {
            throw new Error(`HTTP ${response.status}`);
          }

          backoff = Math.min(MAX_DELAY, Math.max(backoff * 2, retryMs));

          state.delay = backoff;
          updateStatus("アクセス制限・サーバー混雑のため待機");

          clearTimeout(timeout);
          await wait(backoff);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (new URL(response.url).origin !== SITE) {
          throw new Error("サイト外へリダイレクト");
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        if (doc.querySelector("#contentArea .errorBox")) {
          throw new Error("サイト側のエラー画面");
        }

        if (doc.querySelector('input[type="password"]')) {
          throw new Error("ログイン画面の可能性");
        }

        return doc;
      } catch (error) {
        if (state.stopped) throw error;

        const msg = String(error.message || error);

        if (
          msg.startsWith("HTTP ") ||
          msg.includes("サイト外") ||
          msg.includes("ログイン")
        ) {
          throw error;
        }

        if (attempt === MAX_RETRIES) {
          throw error;
        }

        updateStatus(`通信エラー・再試行 ${attempt}/${MAX_RETRIES}`);

        await wait(backoff);
        backoff = Math.min(MAX_DELAY, backoff * 2);
      } finally {
        clearTimeout(timeout);
        if (state.controller === controller) {
          state.controller = null;
        }
      }
    }

    throw new Error("再試行上限");
  }

  function text(element) {
    return element?.textContent?.trim() || "";
  }

  function addItem(values) {
    const url = values.URL;
    if (!url) return;

    if (!state.items.has(url)) {
      state.items.set(url, values);
    }
  }

  function getNextPageUrl(url) {
    const u = new URL(url);
    const match = u.pathname.match(/\/page\/(\d+)\/?$/);

    if (match) {
      const next = Number(match[1]) + 1;
      u.pathname = u.pathname.replace(/\/page\/\d+\/?$/, `/page/${next}`);
    } else {
      u.pathname = u.pathname.replace(/\/$/, "") + "/page/1";
    }

    return u.href;
  }

  function enqueueNextPage(doc, url) {
    const result = text(doc.querySelector("div.searchResult"));

    const match = result.match(
      /全\s*(\d+)\s*件中\s*(\d+)\s*[～〜~\-－]\s*(\d+)\s*件/
    );

    if (!match) {
      // 件数表示を解析できない場合は、
      // 無条件に次ページを取得しない
      return;
    }

    const total = Number(match[1]);
    const end = Number(match[3]);

    if (end < total) {
      enqueue(getNextPageUrl(url), url, true);
    }
  }

  // 検索結果からカテゴリリンクを取得
  function analyzeSearch(doc, url) {
    const link = doc.querySelector(
      "table.searchItemTable td:first-child + td a"
    );

    if (!link) {
      throw new Error("カテゴリリンクが見つかりません");
    }

    enqueue(link.getAttribute("href"), url);
  }

  // 一覧ページ解析
  function analyzeList(doc, url) {
    const rows = doc.querySelectorAll("table.searchItemTable > tbody > tr");

    if (!rows.length) {
      throw new Error("一覧表が見つかりません");
    }

    for (const row of rows) {
      const link = row.querySelector("table.searchItemTable2 a");

      const itemUrl = normalizeUrl(link?.getAttribute("href"), url);

      if (!itemUrl) continue;

      if (state.mode === 2) {
        enqueue(itemUrl, url);
        continue;
      }

      const values = {};
      const table = row.closest("table.searchItemTable");

      const headers = [...table.querySelectorAll(":scope > thead > tr > th")];

      const cells = [...row.children];

      cells.forEach((cell, index) => {
        const key = text(headers[index]);
        if (key) {
          values[key] = text(cell);
        }
      });

      values.URL = itemUrl;
      addItem(values);
    }

    enqueueNextPage(doc, url);
  }

  // 詳細ページ解析
  function analyzeDetail(doc, url) {
    const values = {};

    for (const th of doc.querySelectorAll("table th")) {
      const name = text(th);
      if (!name) continue;

      const row = th.closest("tr");
      const nextRow = row?.nextElementSibling;
      if (!nextRow) continue;

      const index = [...row.children].indexOf(th);
      const cell = nextRow.children[index];

      if (!cell || cell.tagName !== "TD") continue;

      const clone = cell.cloneNode(true);

      clone.querySelectorAll("br").forEach((br) => {
        br.replaceWith("\n");
      });

      values[name] = text(clone);
    }

    if (Object.keys(values).length === 0) {
      throw new Error("詳細情報が見つかりません");
    }

    values.URL = url;
    addItem(values);
  }

  function analyzePage(doc, url) {
    const path = new URL(url).pathname;

    // カテゴリページを先に判定
    if (/\/item\/category\/[0-9a-z]{40}/i.test(path)) {
      analyzeList(doc, url);
      return;
    }

    if (/\/item\/[0-9a-z]{40}/i.test(path)) {
      analyzeDetail(doc, url);
      return;
    }

    if (/\/search\/.*\/item\/?/i.test(path)) {
      analyzeSearch(doc, url);
      return;
    }

    throw new Error("未対応のURL形式");
  }

  function csvCell(value) {
    let str = String(value ?? "");

    // 表計算ソフトによる数式解釈を軽減
    if (/^[\s]*[=+\-@]/.test(str)) {
      str = "'" + str;
    }

    return '"' + str.replace(/"/g, '""') + '"';
  }

  function buildCSV() {
    const keys = [
      ...NORMAL_KEYS,
      ...(state.mode === 2 ? DETAIL_KEYS : []),
      "URL",
    ];

    const lines = [keys.map(csvCell).join(",")];

    for (const item of state.items.values()) {
      lines.push(keys.map((key) => csvCell(item[key])).join(","));
    }

    return lines.join("\r\n") + "\r\n";
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function displayResults() {
    output.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = `取得結果: ${state.items.size}アイテム`;
    output.append(heading);

    const csv = buildCSV();

    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.value = csv;
    textarea.style.cssText = "width:100%;height:220px;box-sizing:border-box";
    output.append(textarea);

    const date = new Date();
    const dateString = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("");

    makeButton("CSVをダウンロード", output, () => {
      downloadFile(
        "\uFEFF" + csv,
        `itemlist_${dateString}.csv`,
        "text/csv;charset=utf-8"
      );
    });

    if (state.failures.length) {
      makeButton("失敗URL一覧を保存", output, () => {
        const data = state.failures
          .map((f) => `${f.url}\t${f.error}`)
          .join("\n");

        downloadFile(
          data,
          `itemlist_errors_${dateString}.txt`,
          "text/plain;charset=utf-8"
        );
      });
    }
  }

  async function start() {
    if (state.running) return;

    const selected = categoryFields.filter((c) => c.checked);

    if (!selected.length) {
      alert("カテゴリを選択してください。");
      return;
    }

    const delay = Number(delayInput.value);

    if (!Number.isFinite(delay) || delay < 1000 || delay > 60000) {
      alert("待機時間は1000～60000msで指定してください。");
      return;
    }

    if (!confirm(`${selected.length}カテゴリの取得を開始しますか？`)) {
      return;
    }

    state.running = true;
    state.stopped = false;
    state.mode = Number(
      form.querySelector('input[name="dq-mode"]:checked').value
    );

    state.delay = delay;
    state.minDelay = delay;
    state.queue = [];
    state.queued.clear();
    state.visited.clear();
    state.items.clear();
    state.failures = [];
    state.requests = 0;
    state.currentUrl = "";

    output.replaceChildren();

    for (const checkbox of selected) {
      const item = checkbox.dataset.item;
      const searchUrl = `${SITE}/sc/search/${encodeURIComponent(item)}/item/`;

      enqueue(searchUrl);
    }

    startButton.disabled = true;
    stopButton.disabled = false;

    form.querySelectorAll("input").forEach((input) => {
      input.disabled = true;
    });

    try {
      while (state.queue.length && !state.stopped) {
        const url = state.queue.shift();
        state.queued.delete(url);

        if (state.visited.has(url)) continue;

        state.currentUrl = url;
        updateStatus("取得中");

        try {
          const doc = await fetchDocument(url);

          if (state.stopped) break;

          analyzePage(doc, url);
          state.visited.add(url);

          // 成功後に急激な間隔短縮は行わない
          state.delay = Math.max(state.minDelay, Math.round(state.delay * 0.9));
        } catch (error) {
          if (state.stopped) break;

          state.failures.push({
            url,
            error: String(error.message || error),
          });

          state.visited.add(url);

          if (/HTTP 429|HTTP 503/.test(String(error.message))) {
            state.stopped = true;
            updateStatus("アクセス制限のため停止");
            break;
          }
        }

        updateStatus("処理中");

        if (state.queue.length && !state.stopped) {
          await wait(state.delay);
        }
      }
    } finally {
      state.running = false;
      state.currentUrl = "";

      startButton.disabled = false;
      stopButton.disabled = true;

      form.querySelectorAll("input").forEach((input) => {
        input.disabled = false;
      });

      displayResults();

      updateStatus(
        state.stopped
          ? "停止しました（取得済みデータは保存可能）"
          : state.failures.length
          ? "終了しました（一部取得失敗あり）"
          : "完了しました"
      );
    }
  }

  updateStatus("準備完了");
})();
