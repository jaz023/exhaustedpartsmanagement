
'use strict';

let PARTS = [
  'フィラメント',
  'チムニ',
  'チムニアッパー絶縁碍子',
  'チムニロワー絶縁碍子',
  'リング'
];

const $ = id => document.getElementById(id);

const api = (window.APP_CONFIG?.API_URL || '').trim();

let rows = [];
let pin = sessionStorage.getItem('partsPin') || '';
let editingId = null;
let editingVersion = 0;

// HTML 特殊字元處理
const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

// 建立下拉選單
const opt = (items, all) =>
  (all ? `<option value="">${all}</option>` : '') +
  items.map(x =>
    `<option value="${esc(x)}">${esc(x)}</option>`
  ).join('');

// 更新連線狀態
function status(text, cls = '') {
  const e = $('connection');
  e.textContent = text;
  e.className = 'status ' + cls;
}

// 透過 JSONP 查詢 Apps Script
function jsonp(params, timeout = 14000) {
  return new Promise((resolve, reject) => {

    if (!api) {
      return reject(
        Error('尚未設定 config.js 的 API_URL')
      );
    }

    const cb =
      'parts_cb_' +
      Date.now() + '_' +
      Math.random().toString(36).slice(2);

    const script = document.createElement('script');

    let timer;

    const clean = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };

    window[cb] = data => {
      clean();

      data?.ok
        ? resolve(data)
        : reject(
            Error(data?.error || '伺服器回傳錯誤')
          );
    };

    script.onerror = () => {
      clean();
      reject(
        Error('無法讀取 Apps Script；請檢查網址及部署權限')
      );
    };

    const u = new URL(api);

    Object.entries({
      ...params,
      pin,
      callback: cb
    }).forEach(([k, v]) => {
      u.searchParams.set(k, v);
    });

    script.src = u.href;

    timer = setTimeout(() => {
      clean();
      reject(Error('連線逾時'));
    }, timeout);

    document.head.appendChild(script);
  });
}

// 年份選單
function updateYears() {
  const ys = [
    ...new Set([
      new Date().getFullYear(),
      ...rows
        .map(r => Number((r.date || '').slice(0, 4)))
        .filter(Number.isFinite)
    ])
  ].sort((a, b) => b - a);

  for (const id of ['filterYear', 'statsYear']) {
    const el = $(id);
    const old = el.value;

    el.innerHTML = opt(
      ys.map(String),
      id === 'filterYear'
        ? '全部年份'
        : null
    );

    el.value = ys.map(String).includes(old)
      ? old
      : (
          id === 'filterYear'
            ? ''
            : String(new Date().getFullYear())
        );
  }
}

// 讀取 Google Sheets 紀錄
async function load() {
  if (!api) {
    status('待設定 Google Sheets', 'bad');
    return;
  }

  status('讀取中…');

  try {
    const data = await jsonp({
      action: 'list'
    });

    rows = Array.isArray(data.records)
      ? data.records
      : [];

    // 從後端取得所有備品工作表名稱
    if (
      Array.isArray(data.parts) &&
      data.parts.length
    ) {
      PARTS = data.parts;

      for (const [id, label] of [
        ['part', null],
        ['filterPart', '全部部品'],
        ['statsPart', '全部部品']
      ]) {
        const el = $(id);
        const selected = el.value;

        el.innerHTML = opt(PARTS, label);

        if (
          [...el.options].some(
            o => o.value === selected
          )
        ) {
          el.value = selected;
        }
      }
    }

    updateYears();
    render();

    status(
      `已連線 · ${rows.length} 筆`,
      'ok'
    );

  } catch (e) {
    status('連線失敗', 'bad');
    $('historyCount').textContent = e.message;
  }
}

// 重新整理畫面
function render() {
  renderHistory();
  renderStats();
}

// 顯示交換履歷
function renderHistory() {
  let a = rows.slice().sort((x, y) =>
    String(y.date).localeCompare(String(x.date)) ||
    String(y.createdAt).localeCompare(
      String(x.createdAt)
    )
  );

  const part = $('filterPart').value;
  const year = $('filterYear').value;

  if (part) {
    a = a.filter(r => r.part === part);
  }

  if (year) {
    a = a.filter(r =>
      String(r.date).startsWith(year)
    );
  }

  $('historyCount').textContent =
    `共 ${a.length} 筆`;

  $('historyBody').innerHTML = a.length
    ? a.map(r => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.part)}</td>
        <td>${esc(r.quantity)}</td>
        <td>
          ${r.minutes === ''
            ? '—'
            : esc(r.minutes)}
        </td>
        <td>${esc(r.operator || '—')}</td>
        <td>${esc(r.location || '—')}</td>
        <td>${esc(r.notes || '—')}</td>
        <td>
          ${r.photoUrl
            ? `<a
                 class="photo-link"
                 target="_blank"
                 rel="noopener noreferrer"
                 href="${esc(r.photoUrl)}"
               >📷 查看</a>`
            : '—'}
        </td>
        <td>
          <button
            class="mini-btn edit-record"
            data-id="${esc(r.id)}"
          >
            修改
          </button>
        </td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="9" class="empty">
          目前沒有符合的紀錄
        </td>
      </tr>
    `;

  document.querySelectorAll(
    '.edit-record'
  ).forEach(b => {
    b.addEventListener('click', () => {
      editRecord(b.dataset.id);
    });
  });
}

// 切換頁籤
function showTab(name) {
  document.querySelectorAll(
    '.tab,.panel'
  ).forEach(x => {
    x.classList.remove('active');
  });

  document.querySelector(
    `.tab[data-tab="${name}"]`
  ).classList.add('active');

  $(name).classList.add('active');
}

// 清空表單
function resetForm() {
  editingId = null;
  editingVersion = 0;

  $('entryForm').reset();

  $('date').value = new Date(
    Date.now() -
    new Date().getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  $('hoursHint').textContent = '可不填';
  $('formTitle').textContent = '新增部品交換';
  $('saveBtn').textContent = '儲存交換紀錄';
  $('photoPreview').innerHTML = '';
  $('formMessage').textContent = '';
}

// 編輯既有紀錄
function editRecord(id) {
  const r = rows.find(x => x.id === id);

  if (!r) return;

  editingId = r.id;
  editingVersion = Number(r.version) || 1;

  [
    'part',
    'date',
    'quantity',
    'minutes',
    'operator',
    'location',
    'notes'
  ].forEach(k => {
    $(k).value = r[k] ?? '';
  });

  $('photo').value = '';

  $('photoPreview').innerHTML = r.photoUrl
    ? `
      <a
        class="photo-link"
        target="_blank"
        rel="noopener noreferrer"
        href="${esc(r.photoUrl)}"
      >
        📷 目前照片（未選新照片則保留）
      </a>
    `
    : '尚無照片';

  $('formTitle').textContent =
    '修改部品交換紀錄';

  $('saveBtn').textContent = '儲存修改';

  $('formMessage').textContent =
    `正在編輯：${r.date} ${r.part}（版本 ${editingVersion}）`;

  showTab('entry');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// 照片壓縮處理
async function compressedPhoto(file) {
  if (!file) return null;

  if (![
    'image/jpeg',
    'image/png',
    'image/webp'
  ].includes(file.type)) {
    throw Error(
      '照片格式僅支援 JPG、PNG、WebP'
    );
  }

  const bitmap = await createImageBitmap(file);

  const max = 1600;

  const scale = Math.min(
    1,
    max / Math.max(
      bitmap.width,
      bitmap.height
    )
  );

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(
    bitmap.width * scale
  );

  canvas.height = Math.round(
    bitmap.height * scale
  );

  canvas.getContext('2d').drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height
  );

  bitmap.close?.();

  let quality = 0.82;
  let blob;

  do {
    blob = await new Promise(r =>
      canvas.toBlob(
        r,
        'image/jpeg',
        quality
      )
    );

    quality -= 0.1;

  } while (
    blob?.size > 2.6 * 1024 * 1024 &&
    quality >= 0.42
  );

  if (
    !blob ||
    blob.size > 3 * 1024 * 1024
  ) {
    throw Error(
      '照片太大，請縮小後再上傳'
    );
  }

  const base64 = await new Promise(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () =>
        resolve(
          String(reader.result).split(',')[1]
        );

      reader.onerror = reject;

      reader.readAsDataURL(blob);
    }
  );

  return {
    mime: 'image/jpeg',
    base64
  };
}

// 每月統計：依實際更換數量加總
function renderStats() {
  const y = $('statsYear').value;
  const p = $('statsPart').value;

  const a = rows.filter(r =>
    r.date?.startsWith(y) &&
    (!p || r.part === p)
  );

  const months = Array.from(
    { length: 12 },
    (_, i) => ({
      month: i + 1,
      qty: 0,
      count: 0
    })
  );

  a.forEach(r => {
    const m = Number(
      r.date.slice(5, 7)
    );

    if (m >= 1 && m <= 12) {
      months[m - 1].qty +=
        Number(r.quantity) || 0;

      months[m - 1].count++;
    }
  });

  $('annualQty').textContent =
    months.reduce(
      (s, x) => s + x.qty,
      0
    );

  $('annualCount').textContent =
    a.length;

  const max = Math.max(
    ...months.map(x => x.qty),
    1
  );

  $('chart').innerHTML = months.map(x => `
    <div class="bar-col">
      <span class="bar-count">
        ${x.qty || ''}
      </span>
      <div
        class="bar"
        title="${x.month} 月：${x.qty}"
        style="height:${
          x.qty
            ? Math.max(
                6,
                x.qty / max * 125
              )
            : 2
        }px"
      ></div>
      <span class="bar-label">
        ${x.month}月
      </span>
    </div>
  `).join('');

  $('monthlyBody').innerHTML = months.map(x => `
    <tr>
      <td>${x.month} 月</td>
      <td>${x.qty}</td>
      <td>${x.count}</td>
    </tr>
  `).join('');
}

// 初始設定
function init() {
  $('pinBtn').addEventListener(
    'click',
    () => {
      const v = prompt(
        '輸入 Apps Script 所設定的存取 PIN（留空可清除）',
        pin
      );

      if (v !== null) {
        pin = v.trim();

        sessionStorage.setItem(
          'partsPin',
          pin
        );

        load();
      }
    }
  );

  for (const [id, all] of [
    ['part', null],
    ['filterPart', '全部部品'],
    ['statsPart', '全部部品']
  ]) {
    $(id).innerHTML = opt(PARTS, all);
  }

  $('date').value = new Date(
    Date.now() -
    new Date().getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  $('minutes').addEventListener(
    'input',
    () => {
      $('hoursHint').textContent =
        $('minutes').value
          ? `約 ${(Number($('minutes').value) / 60).toFixed(2)} 小時`
          : '可不填';
    }
  );

  document.querySelectorAll(
    '.tab'
  ).forEach(t => {
    t.addEventListener(
      'click',
      () => showTab(t.dataset.tab)
    );
  });

  $('cancelBtn').addEventListener(
    'click',
    resetForm
  );

  [
    'filterPart',
    'filterYear'
  ].forEach(id => {
    $(id).addEventListener(
      'change',
      renderHistory
    );
  });

  [
    'statsPart',
    'statsYear'
  ].forEach(id => {
    $(id).addEventListener(
      'change',
      renderStats
    );
  });

  $('refreshBtn').addEventListener(
    'click',
    load
  );

  $('entryForm').addEventListener(
    'submit',
    save
  );

  if (api) {
    load();
  } else {
    status(
      '待設定 Google Sheets',
      'bad'
    );
  }
}

// 新增／修改交換紀錄
async function save(e) {
  e.preventDefault();

  const msg = $('formMessage');
  const button = $('saveBtn');

  if (!api) {
    msg.textContent =
      '請先在 config.js 設定 API_URL';

    msg.className = 'message error';
    return;
  }

  const record = {
    id: editingId || (
      crypto.randomUUID
        ? crypto.randomUUID()
        : 'record-' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2)
    ),

    part: $('part').value,

    date: $('date').value,

    quantity: Number(
      $('quantity').value
    ),

    minutes:
      $('minutes').value === ''
        ? ''
        : Number($('minutes').value),

    operator: $('operator').value.trim(),

    location: $('location').value.trim(),

    notes: $('notes').value.trim()
  };

  // 輸入驗證
  if (
    !PARTS.includes(record.part) ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.date) ||
    !Number.isInteger(record.quantity) ||
    record.quantity < 1 ||
    !record.operator ||
    record.location.length > 200 ||
    (
      record.minutes !== '' &&
      (
        !Number.isFinite(record.minutes) ||
        record.minutes < 0
      )
    )
  ) {
    msg.textContent =
      '請檢查必填欄位及數值';

    msg.className = 'message error';
    return;
  }

  button.disabled = true;
  msg.className = 'message';
  msg.textContent = '準備照片中…';

  const action = editingId
    ? 'update'
    : 'add';

  const oldVersion = editingVersion;

  try {
    const photo = await compressedPhoto(
      $('photo').files[0]
    );

    msg.textContent =
      '傳送中，正在向 Google Sheets 確認…';

    // 寫入 Apps Script
    await fetch(api, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type':
          'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        pin,
        record,
        expectedVersion: oldVersion,
        photo
      })
    });

    // 再次查詢確認資料是否已寫入
    let verified = false;

    for (let i = 0; i < 8; i++) {
      await new Promise(r =>
        setTimeout(
          r,
          i === 0 ? 1200 : 1500
        )
      );

      try {
        const res = await jsonp({
          action: 'check',
          id: record.id
        }, 14000);

        if (
          res.found &&
          (
            action === 'add' ||
            res.version > oldVersion
          )
        ) {
          verified = true;
          break;
        }

      } catch (err) {
        if (i === 7) {
          throw err;
        }
      }
    }

    if (!verified) {
      throw Error(
        '尚未確認寫入；可能是照片上傳失敗、權限不足或版本衝突。' +
        '請重新整理歷史紀錄核對，勿立即重複送出。'
      );
    }

    resetForm();

    msg.textContent =
      action === 'update'
        ? '✓ 修改成功，已寫入 Google Sheets'
        : '✓ 新增成功，已寫入 Google Sheets';

    msg.className = 'message good';

    await load();

  } catch (err) {
    msg.textContent =
      '寫入狀態未確認：' +
      err.message;

    msg.className = 'message error';

  } finally {
    button.disabled = false;
  }
}

// 照片預覽
$('photo').addEventListener(
  'change',
  () => {
    const f = $('photo').files[0];

    if (!f) return;

    const u = URL.createObjectURL(f);

    $('photoPreview').innerHTML = '';

    const img = document.createElement('img');

    img.src = u;
    img.alt = '照片預覽';

    img.onload = () =>
      URL.revokeObjectURL(u);

    $('photoPreview').appendChild(img);
  }
);

// 啟動
init();
