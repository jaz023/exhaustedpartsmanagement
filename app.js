
'use strict';

// ========================================
// 部品交換履歷 V6.3 — 完整 app.js
// ========================================

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


// ========================================
// 1. 共用工具
// ========================================

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

const opt = (items, placeholder) =>
  (placeholder
    ? `<option value="">${placeholder}</option>`
    : ''
  ) +
  items.map(item =>
    `<option value="${esc(item)}">${esc(item)}</option>`
  ).join('');

function status(text, className = '') {
  const element = $('connection');

  if (!element) return;

  element.textContent = text;
  element.className = 'status ' + className;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ========================================
// 2. Google Apps Script JSONP
// ========================================

function jsonp(params, timeout = 14000) {
  return new Promise((resolve, reject) => {

    if (!api) {
      reject(new Error('尚未設定 config.js 的 API_URL'));
      return;
    }

    const callback =
      'parts_cb_' +
      Date.now() + '_' +
      Math.random().toString(36).slice(2);

    const script = document.createElement('script');

    let timer;
    let finished = false;

    function cleanup() {
      if (finished) return;

      finished = true;
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = data => {
      cleanup();

      if (data?.ok) {
        resolve(data);
      } else {
        reject(new Error(
          data?.error || '伺服器回傳錯誤'
        ));
      }
    };

    script.onerror = () => {
      cleanup();

      reject(new Error(
        '無法讀取 Apps Script，請檢查網址及部署權限'
      ));
    };

    const url = new URL(api);

    Object.entries({
      ...params,
      pin,
      callback
    }).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    script.src = url.href;

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('連線逾時'));
    }, timeout);

    document.head.appendChild(script);
  });
}


// ========================================
// 3. 年份選單
// ========================================

function updateYears() {
  const years = [
    ...new Set([
      new Date().getFullYear(),
      ...rows.map(record =>
        Number(String(record.date || '').slice(0, 4))
      ).filter(Number.isFinite)
    ])
  ].sort((a, b) => b - a);

  for (const id of ['filterYear', 'statsYear']) {
    const element = $(id);
    if (!element) continue;

    const previous = element.value;

    element.innerHTML = opt(
      years.map(String),
      id === 'filterYear' ? '全部年份' : null
    );

    element.value = years.map(String).includes(previous)
      ? previous
      : id === 'filterYear'
        ? ''
        : String(new Date().getFullYear());
  }
}


// ========================================
// 4. 更新備品下拉選單
// ========================================

function updatePartSelectors() {
  const selectors = [
    ['part', null],
    ['filterPart', '全部部品'],
    ['statsPart', '全部部品']
  ];

  selectors.forEach(([id, placeholder]) => {
    const element = $(id);
    if (!element) return;

    const previous = element.value;

    element.innerHTML = opt(PARTS, placeholder);

    if ([...element.options].some(
      option => option.value === previous
    )) {
      element.value = previous;
    }
  });
}


// ========================================
// 5. 讀取 Google Sheets
// ========================================

async function load() {
  if (!api) {
    status('待設定 Google Sheets', 'bad');
    return false;
  }

  status('讀取中…');

  try {
    const data = await jsonp({
      action: 'list'
    });

    rows = Array.isArray(data.records)
      ? data.records
      : [];

    if (Array.isArray(data.parts)) {
      PARTS = data.parts;
      updatePartSelectors();
    }

    updateYears();
    render();

    status(`已連線 · ${rows.length} 筆`, 'ok');

    return true;

  } catch (error) {
    status('連線失敗', 'bad');

    if ($('historyCount')) {
      $('historyCount').textContent = error.message;
    }

    console.error('Google Sheets 讀取失敗：', error);

    return false;
  }
}


// ========================================
// 6. 重新整理頁面資料
// ========================================

function render() {
  renderHistory();
  renderStats();
}


// ========================================
// 7. 交換履歷
// ========================================

function renderHistory() {
  const tbody = $('historyBody');
  if (!tbody) return;

  let records = rows.slice().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  const selectedPart = $('filterPart')?.value || '';
  const selectedYear = $('filterYear')?.value || '';

  if (selectedPart) {
    records = records.filter(
      record => record.part === selectedPart
    );
  }

  if (selectedYear) {
    records = records.filter(
      record => String(record.date).startsWith(selectedYear)
    );
  }

  if ($('historyCount')) {
    $('historyCount').textContent =
      `共 ${records.length} 筆`;
  }

  tbody.innerHTML = records.length
    ? records.map(record => `
      <tr>
        <td>${esc(record.date)}</td>
        <td>${esc(record.part)}</td>
        <td>${esc(record.quantity)}</td>
        <td>
          ${record.minutes === ''
            ? '—'
            : esc(record.minutes)}
        </td>
        <td>${esc(record.operator || '—')}</td>
        <td>${esc(record.location || '—')}</td>
        <td>${esc(record.notes || '—')}</td>
        <td>
          ${record.photoUrl
            ? `<a
                class="photo-link"
                target="_blank"
                rel="noopener noreferrer"
                href="${esc(record.photoUrl)}"
              >📷 查看</a>`
            : '—'}
        </td>
        <td>
          <button
            type="button"
            class="mini-btn edit-record"
            data-id="${esc(record.id)}"
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

  document.querySelectorAll('.edit-record')
    .forEach(button => {
      button.addEventListener('click', () => {
        editRecord(button.dataset.id);
      });
    });
}


// ========================================
// 8. 切換頁籤
// ========================================

function showTab(name) {
  document.querySelectorAll('.tab, .panel')
    .forEach(element => {
      element.classList.remove('active');
    });

  document.querySelector(
    `.tab[data-tab="${name}"]`
  )?.classList.add('active');

  $(name)?.classList.add('active');
}


// ========================================
// 9. 重設表單
// ========================================

function resetForm() {
  editingId = null;
  editingVersion = 0;

  $('entryForm').reset();

  const today = new Date(
    Date.now() -
    new Date().getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  $('date').value = today;

  $('hoursHint').textContent = '可不填';
  $('formTitle').textContent = '新增部品交換';
  $('saveBtn').textContent = '儲存交換紀錄';
  $('photoPreview').innerHTML = '';
  $('formMessage').textContent = '';
}


// ========================================
// 10. 修改既有紀錄
// ========================================

function editRecord(id) {
  const record = rows.find(item => item.id === id);

  if (!record) return;

  editingId = record.id;
  editingVersion = Number(record.version) || 1;

  [
    'part',
    'date',
    'quantity',
    'minutes',
    'operator',
    'location',
    'notes'
  ].forEach(key => {
    if ($(key)) {
      $(key).value = record[key] ?? '';
    }
  });

  $('photo').value = '';

  $('photoPreview').innerHTML = record.photoUrl
    ? `
      <a
        class="photo-link"
        target="_blank"
        rel="noopener noreferrer"
        href="${esc(record.photoUrl)}"
      >
        📷 目前照片（未選新照片則保留）
      </a>
    `
    : '尚無照片';

  $('formTitle').textContent = '修改部品交換紀錄';
  $('saveBtn').textContent = '儲存修改';

  $('formMessage').textContent =
    `正在編輯：${record.date} ${record.part}` +
    `（版本 ${editingVersion}）`;

  showTab('entry');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


// ========================================
// 11. 照片壓縮
// ========================================

async function compressedPhoto(file) {
  if (!file) return null;

  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!supportedTypes.includes(file.type)) {
    throw new Error('照片格式僅支援 JPG、PNG、WebP');
  }

  const bitmap = await createImageBitmap(file);

  const maxSize = 1600;

  const scale = Math.min(
    1,
    maxSize / Math.max(bitmap.width, bitmap.height)
  );

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  canvas.getContext('2d').drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height
  );

  bitmap.close?.();

  let quality = 0.82;
  let blob = null;

  do {
    blob = await new Promise(resolve =>
      canvas.toBlob(
        resolve,
        'image/jpeg',
        quality
      )
    );

    quality -= 0.1;

  } while (
    blob?.size > 2.6 * 1024 * 1024 &&
    quality >= 0.42
  );

  if (!blob || blob.size > 3 * 1024 * 1024) {
    throw new Error('照片太大，請縮小後再上傳');
  }

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result).split(',')[1]);
    };

    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    mime: 'image/jpeg',
    base64
  };
}


// ========================================
// 12. 月別交換數量統計
// ========================================

function renderStats() {
  const selectedYear = $('statsYear')?.value || '';
  const selectedPart = $('statsPart')?.value || '';

  const records = rows.filter(record =>
    String(record.date || '').startsWith(selectedYear) &&
    (!selectedPart || record.part === selectedPart)
  );

  const months = Array.from(
    { length: 12 },
    (_, index) => ({
      month: index + 1,
      qty: 0,
      count: 0
    })
  );

  records.forEach(record => {
    const month = Number(
      String(record.date).slice(5, 7)
    );

    if (month >= 1 && month <= 12) {
      months[month - 1].qty +=
        Number(record.quantity) || 0;

      months[month - 1].count++;
    }
  });

  $('annualQty').textContent = months.reduce(
    (total, month) => total + month.qty,
    0
  );

  $('annualCount').textContent = records.length;

  const max = Math.max(
    ...months.map(month => month.qty),
    1
  );

  $('chart').innerHTML = months.map(month => `
    <div class="bar-col">
      <span class="bar-count">
        ${month.qty || ''}
      </span>

      <div
        class="bar"
        title="${month.month} 月：${month.qty}"
        style="height:${
          month.qty
            ? Math.max(6, month.qty / max * 125)
            : 2
        }px"
      ></div>

      <span class="bar-label">
        ${month.month}月
      </span>
    </div>
  `).join('');

  $('monthlyBody').innerHTML = months.map(month => `
    <tr>
      <td>${month.month} 月</td>
      <td>${month.qty}</td>
      <td>${month.count}</td>
    </tr>
  `).join('');
   
// 更新使用時間趨勢曲線圖
   renderUsageTrend();
}


// ========================================
// 13. V6.3 網頁新增備品
// ========================================

async function createPartFromWeb() {
  const nameField = $('newPartName');
  const pinField = $('newPartAdminPin');
  const button = $('createPartBtn');
  const message = $('createPartMessage');

  if (!nameField || !pinField || !button || !message) {
    console.error('找不到新增備品表單元素');
    return;
  }

  const partName = nameField.value.trim();
  const adminPin = pinField.value;

  function show(text, className = '') {
    message.textContent = text;
    message.className = 'message ' + className;
  }

  if (!api) {
    show('請先設定 config.js 的 API_URL', 'error');
    return;
  }

  if (!partName) {
    show('請輸入備品名稱', 'error');
    return;
  }

  if (
    partName.length > 100 ||
    /[\\/?*\[\]:]/.test(partName) ||
    partName.startsWith('_')
  ) {
    show('備品名稱不合法', 'error');
    return;
  }

  if (!adminPin) {
    show('請輸入管理者 PIN', 'error');
    return;
  }

  if (PARTS.includes(partName)) {
    show('此備品已存在', 'error');
    return;
  }

  if (!confirm(
    `確定建立備品「${partName}」以及兩張圖表嗎？`
  )) {
    return;
  }

  button.disabled = true;
  show('正在送出新增要求…');

  try {
    await fetch(api, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'addPart',
        pin,
        adminPin,
        partName
      })
    });

    show('要求已送出，正在確認新工作表…');

    let exists = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(1500);

      try {
        const result = await jsonp({
          action: 'list'
        });

        if (
          Array.isArray(result.parts) &&
          result.parts.includes(partName)
        ) {
          exists = true;
          break;
        }
      } catch (error) {
        console.warn(
          '確認新備品時讀取失敗：',
          error
        );
      }
    }

    if (!exists) {
      throw new Error(
        '尚未確認新工作表。' +
        '請先查看 Google Sheets 和 Apps Script 執行紀錄，' +
        '勿重複提交。'
      );
    }

    const refreshed = await load();

    if (!refreshed) {
      throw new Error(
        '新工作表已建立，但更新網頁清單失敗。'
      );
    }

    if ($('part')) {
      $('part').value = partName;
    }

    nameField.value = '';
    pinField.value = '';

    show(
      '✓ 新備品已建立。' +
      '請到 Google Sheets 檢查月別長條圖與使用時間曲線圖。',
      'good'
    );

  } catch (error) {
    show(
      '新增狀態未確認：' + error.message,
      'error'
    );

  } finally {
    button.disabled = false;
  }
}


// ========================================
// 14. 初始化按鈕及事件
// ========================================

function init() {

  // PIN 設定
  $('pinBtn').addEventListener('click', () => {
    const value = prompt(
      '輸入 Apps Script 所設定的存取 PIN（留空可清除）',
      pin
    );

    if (value !== null) {
      pin = value.trim();

      sessionStorage.setItem(
        'partsPin',
        pin
      );

      load();
    }
  });

  // 更新部品清單
  const refreshPartsBtn = $('refreshPartsBtn');

  if (refreshPartsBtn) {
    refreshPartsBtn.addEventListener(
      'click',
      async () => {
        refreshPartsBtn.disabled = true;
        refreshPartsBtn.textContent = '更新中…';

        try {
          const success = await load();

          if (!success) {
            console.warn('部品清單更新失敗');
          }

        } finally {
          refreshPartsBtn.disabled = false;
          refreshPartsBtn.textContent = '↻ 更新部品清單';
        }
      }
    );
  }

  // V6.3 新增備品
  const createPartBtn = $('createPartBtn');

  if (createPartBtn) {
    createPartBtn.addEventListener(
      'click',
      createPartFromWeb
    );
  }

  // 初始化部品選單
  updatePartSelectors();

  // 設定今天日期
  $('date').value = new Date(
    Date.now() -
    new Date().getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  // 使用時間換算
  $('minutes').addEventListener('input', () => {
    const minutes = Number($('minutes').value);

    $('hoursHint').textContent =
      $('minutes').value
        ? `約 ${(minutes / 60).toFixed(2)} 小時`
        : '可不填';
  });

  // 頁籤切換
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener(
      'click',
      () => showTab(tab.dataset.tab)
    );
  });

  // 取消編輯
  $('cancelBtn').addEventListener(
    'click',
    resetForm
  );

  // 歷史查詢篩選
  ['filterPart', 'filterYear'].forEach(id => {
    $(id).addEventListener(
      'change',
      renderHistory
    );
  });

  // 統計篩選
  ['statsPart', 'statsYear'].forEach(id => {
    $(id).addEventListener(
      'change',
      renderStats
    );
  });

  // 重新整理
  $('refreshBtn').addEventListener(
    'click',
    load
  );

  // 新增／修改交換紀錄
  $('entryForm').addEventListener(
    'submit',
    save
  );

  // 連線 Google Sheets
  if (api) {
    load();
  } else {
    status('待設定 Google Sheets', 'bad');
  }
}


// ========================================
// 15. 儲存交換紀錄
// ========================================

async function save(event) {
  event.preventDefault();

  const message = $('formMessage');
  const button = $('saveBtn');

  if (!api) {
    message.textContent =
      '請先在 config.js 設定 API_URL';

    message.className = 'message error';
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
    quantity: Number($('quantity').value),

    minutes: $('minutes').value === ''
      ? ''
      : Number($('minutes').value),

    operator: $('operator').value.trim(),
    location: $('location').value.trim(),
    notes: $('notes').value.trim()
  };

  if (
    !PARTS.includes(record.part) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
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
    message.textContent = '請檢查必填欄位及數值';
    message.className = 'message error';
    return;
  }

  button.disabled = true;

  message.className = 'message';
  message.textContent = '準備照片中…';

  const action = editingId ? 'update' : 'add';
  const oldVersion = editingVersion;

  try {
    const photo = await compressedPhoto(
      $('photo').files[0]
    );

    message.textContent =
      '傳送中，正在向 Google Sheets 確認…';

    await fetch(api, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        pin,
        record,
        expectedVersion: oldVersion,
        photo
      })
    });

    // 由後端再次確認是否寫入
    let verified = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(attempt === 0 ? 1200 : 1500);

      try {
        const result = await jsonp({
          action: 'check',
          id: record.id
        });

        if (
          result.found &&
          (
            action === 'add' ||
            Number(result.version) > oldVersion
          )
        ) {
          verified = true;
          break;
        }

      } catch (error) {
        if (attempt === 7) {
          throw error;
        }
      }
    }

    if (!verified) {
      throw new Error(
        '尚未確認寫入。' +
        '請重新整理歷史紀錄核對，勿立即重複提交。'
      );
    }

    resetForm();

    message.textContent =
      action === 'update'
        ? '✓ 修改成功，已寫入 Google Sheets'
        : '✓ 新增成功，已寫入 Google Sheets';

    message.className = 'message good';

    await load();

  } catch (error) {
    message.textContent =
      '寫入狀態未確認：' + error.message;

    message.className = 'message error';

  } finally {
    button.disabled = false;
  }
}


// ========================================
// 16. 照片預覽
// ========================================

$('photo').addEventListener('change', () => {
  const file = $('photo').files[0];

  if (!file) return;

  const url = URL.createObjectURL(file);

  $('photoPreview').innerHTML = '';

  const image = document.createElement('img');

  image.src = url;
  image.alt = '照片預覽';

  image.onload = () => URL.revokeObjectURL(url);

  $('photoPreview').appendChild(image);
});


// ========================================
// 17. 啟動
// ========================================

init();

/**
 * V6.4 使用時間趨勢圖
 *
 * X 軸：交換日期
 * Y 軸：使用時間 (min)
 *
 * 使用目前 Google Sheets 已讀取的 rows。
 * 不需要額外圖表套件。
 */

function renderUsageTrend() {
  const panel = $('statsPart')?.closest('.panel');

  if (!panel) return;

  let container = $('usageTrendSection');

  // 第一次執行時建立圖表區
  if (!container) {
    container = document.createElement('section');
    container.id = 'usageTrendSection';

    container.style.cssText = `
      margin-top: 28px;
      padding: 20px;
      background: #ffffff;
      border: 1px solid #dce5ed;
      border-radius: 16px;
    `;

    container.innerHTML = `
      <h3 style="margin:0 0 8px">
        部品使用時間趨勢
      </h3>
      <p style="color:#64748b">
        X 軸：交換日期｜Y 軸：使用時間（min）
      </p>
      <div
        id="usageTrendChart"
        style="width:100%;overflow-x:auto"
      ></div>
      <p
        id="usageTrendInfo"
        style="color:#64748b;font-size:13px"
      ></p>
    `;

    panel.appendChild(container);
  }

  const chart = $('usageTrendChart');
  const info = $('usageTrendInfo');

  const year = $('statsYear')?.value || '';
  const part = $('statsPart')?.value || '';

  // 不混合不同備品的壽命
  if (!part) {
    chart.innerHTML = '';
    info.textContent = '請先選擇一種備品查看趨勢。';
    return;
  }

  // 篩選有使用時間的交換紀錄
  const data = rows
    .filter(r => {
      const minutes = Number(r.minutes);

      return (
        r.part === part &&
        (!year || String(r.date).startsWith(year)) &&
        r.minutes !== '' &&
        r.minutes !== null &&
        r.minutes !== undefined &&
        Number.isFinite(minutes) &&
        minutes >= 0
      );
    })
    .map(r => ({
      id: String(r.id || ''),
      date: String(r.date),
      minutes: Number(r.minutes)
    }))
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id)
    );

  if (!data.length) {
    chart.innerHTML = '';
    info.textContent = '這個備品目前沒有使用時間紀錄。';
    return;
  }

  // SVG 繪圖設定
  const width = Math.max(540, data.length * 65 + 100);
  const height = 310;

  const left = 72;
  const right = 25;
  const top = 25;
  const bottom = 68;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const maxValue = Math.max(
    1,
    ...data.map(item => item.minutes)
  );

  // Y 軸留出 10% 空間
  const yMax = maxValue * 1.1;

  const x = index =>
    left +
    (data.length === 1
      ? plotWidth / 2
      : index * plotWidth / (data.length - 1));

  const y = value =>
    top + plotHeight - value / yMax * plotHeight;

  const ticks = 4;

  // 水平輔助線與 Y 軸數值
  const grid = Array.from(
    { length: ticks + 1 },
    (_, i) => {
      const value = yMax * i / ticks;
      const py = y(value);

      return `
        <line
          x1="${left}"
          y1="${py}"
          x2="${width - right}"
          y2="${py}"
          stroke="#e2e8f0"
          stroke-dasharray="4 4"
        />
        <text
          x="${left - 10}"
          y="${py + 4}"
          text-anchor="end"
          font-size="12"
          fill="#64748b"
        >
          ${Math.round(value)}
        </text>
      `;
    }
  ).join('');

  // 折線座標
  const points = data.map((item, index) =>
    `${x(index)},${y(item.minutes)}`
  ).join(' ');

  // 點與資料提示
  const circles = data.map((item, index) => `
    <circle
      cx="${x(index)}"
      cy="${y(item.minutes)}"
      r="5"
      fill="#ffffff"
      stroke="#1769aa"
      stroke-width="2.5"
    >
      <title>
        ${item.date}｜${item.minutes} min
      </title>
    </circle>
  `).join('');

  // 日期標籤
  const labels = data.map((item, index) => `
    <text
      x="${x(index)}"
      y="${height - bottom + 22}"
      transform="rotate(-40 ${x(index)}
        ${height - bottom + 22})"
      text-anchor="end"
      font-size="11"
      fill="#64748b"
    >
      ${item.date.slice(5)}
    </text>
  `).join('');

  const line = data.length > 1
    ? `
      <polyline
        points="${points}"
        fill="none"
        stroke="#1769aa"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    `
    : '';

  chart.innerHTML = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="部品使用時間趨勢圖"
      style="display:block;max-width:none"
    >
      ${grid}

      <line
        x1="${left}"
        y1="${top}"
        x2="${left}"
        y2="${top + plotHeight}"
        stroke="#94a3b8"
      />

      ${line}
      ${circles}
      ${labels}
    </svg>
  `;

  const average =
    data.reduce((sum, item) => sum + item.minutes, 0) /
    data.length;

  info.textContent =
    `${part}｜${data.length} 筆紀錄｜` +
    `平均 ${average.toFixed(1)} min` +
    `（${(average / 60).toFixed(1)} 小時）`;
}
