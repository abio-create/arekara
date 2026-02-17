/* ============================================================
   アレカラ (Arekara) — Application Logic
   ============================================================ */

(() => {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEY = 'interval-tracker-data';
  const ICON_COLORS = [
    '#a8e6cf', '#c3b1e1', '#ffd3b6', '#ffaaa5', '#a0d2db',
    '#f6c6ea', '#b5ead7', '#c7ceea', '#ffdac1', '#e2f0cb',
  ];

  // ---- State ----
  let state = { items: [] };
  let currentItemId = null;
  let elapsedTimerId = null;

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const screenList = $('#screen-list');
  const screenDetail = $('#screen-detail');
  const itemListEl = $('#item-list');
  const emptyState = $('#empty-state');
  const btnAddItem = $('#btn-add-item');
  const btnBack = $('#btn-back');
  const btnDeleteItem = $('#btn-delete-item');
  const btnRecordDetail = $('#btn-record-detail');
  const detailTitle = $('#detail-title');
  const freqDaily = $('#freq-daily');
  const freqMonthly = $('#freq-monthly');
  const freqYearly = $('#freq-yearly');
  const countToday = $('#count-today');
  const countMonth = $('#count-month');
  const countYear = $('#count-year');
  const countAll = $('#count-all');
  const historyList = $('#history-list');
  const historyEmpty = $('#history-empty');
  const modalOverlay = $('#modal-overlay');
  const inputItemName = $('#input-item-name');
  const btnModalCancel = $('#btn-modal-cancel');
  const btnModalAdd = $('#btn-modal-add');
  const modalDeleteOverlay = $('#modal-delete-overlay');
  const btnDeleteCancel = $('#btn-delete-cancel');
  const btnDeleteConfirm = $('#btn-delete-confirm');
  const toast = $('#toast');
  const elapsedTimerEl = $('#elapsed-timer');
  const elapsedTimerValue = $('#elapsed-timer-value');
  const inputItemPrice = $('#input-item-price');
  const detailTotalCost = $('#detail-total-cost');
  const detailAnnualCost = $('#detail-annual-cost');
  const annualCostCard = $('#annual-cost-card');
  const modalRecordOverlay = $('#modal-record-overlay');
  const inputRecordAmount = $('#input-record-amount');
  const btnRecordCancel = $('#btn-record-cancel');
  const btnRecordConfirm = $('#btn-record-confirm');
  let pendingRecordItemId = null; // item ID waiting for record confirmation
  const detailPriceLine = $('#detail-price-line');
  const detailPriceText = $('#detail-price-text');
  const btnEditPrice = $('#btn-edit-price');
  const modalPriceEditOverlay = $('#modal-price-edit-overlay');
  const inputEditPrice = $('#input-edit-price');
  const btnPriceEditCancel = $('#btn-price-edit-cancel');
  const btnPriceEditSave = $('#btn-price-edit-save');
  const modalHistoryEditOverlay = $('#modal-history-edit-overlay');
  const historyEditDate = $('#history-edit-date');
  const inputHistoryAmount = $('#input-history-amount');
  const btnHistoryEditCancel = $('#btn-history-edit-cancel');
  const btnHistoryEditSave = $('#btn-history-edit-save');
  let editingHistoryChronoIdx = null; // index of record being edited

  // ---- Storage ----
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!state || !Array.isArray(state.items)) state = { items: [] };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // Migrate old data: records were plain ISO strings, now {date, amount}
  function migrateData() {
    state.items.forEach(item => {
      if (item.defaultPrice === undefined) item.defaultPrice = 0;
      item.records = item.records.map(r => {
        if (typeof r === 'string') return { date: r, amount: 0 };
        return r;
      });
    });
    save();
  }

  // Helper to get date strings from records (handles both old and new format)
  function getRecordDate(record) {
    return typeof record === 'string' ? record : record.date;
  }
  function getRecordAmount(record) {
    return typeof record === 'object' ? (record.amount || 0) : 0;
  }

  // ---- Helpers ----
  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID()
      : 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
        ((Math.random() * 16) | 0).toString(16));
  }

  function getColorForIndex(index) {
    return ICON_COLORS[index % ICON_COLORS.length];
  }

  function formatYen(amount) {
    return '¥' + Math.round(amount).toLocaleString();
  }

  function calcAnnualCost(item) {
    if (item.records.length < 2) {
      // Not enough data; use default price * 1/year or show 0
      return item.records.length === 1 ? item.defaultPrice : 0;
    }
    const dates = item.records.map(r => new Date(getRecordDate(r)).getTime()).sort((a, b) => a - b);
    const totalSpanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    if (totalSpanDays === 0) return 0;
    const avgInterval = totalSpanDays / (dates.length - 1);
    const avgAmount = item.records.reduce((s, r) => s + getRecordAmount(r), 0) / item.records.length;
    return (365 / avgInterval) * avgAmount;
  }

  function elapsedDaysText(records) {
    if (!records || records.length === 0) return '記録なし';
    const last = new Date(getRecordDate(records[records.length - 1]));
    const now = new Date();
    const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diff === 0) return null; // "today" — handled specially
    if (diff === 1) return 'あれから 1日';
    return `あれから ${diff}日`;
  }

  function elapsedDaysLabel(records) {
    if (!records || records.length === 0) return '—';
    const last = new Date(getRecordDate(records[records.length - 1]));
    const now = new Date();
    const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今日';
    return `${diff}日ぶり`;
  }

  function formatElapsedDetailed(totalDays) {
    if (totalDays === 0) return '今日';
    if (totalDays === 1) return '1日ぶり';

    const months = Math.floor(totalDays / 30);
    const remainAfterMonths = totalDays % 30;
    const weeks = Math.floor(remainAfterMonths / 7);
    const days = remainAfterMonths % 7;

    // If it fits neatly into just days (< 7), simple format
    if (months === 0 && weeks === 0) return `${totalDays}日ぶり`;

    const parts = [];
    if (months > 0) parts.push(`${months}か月`);
    if (weeks > 0) parts.push(`${weeks}週間`);
    if (days > 0) parts.push(`${days}日`);

    return `${parts.join('')}ぶり（${totalDays}日ぶり）`;
  }

  function formatElapsedLive(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;

    const totalDays = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const months = Math.floor(totalDays / 30);
    const remainAfterMonths = totalDays % 30;
    const weeks = Math.floor(remainAfterMonths / 7);
    const days = remainAfterMonths % 7;

    const timePart = `${hours}時間${minutes}分${seconds}秒`;

    const dateParts = [];
    if (months > 0) dateParts.push(`${months}か月`);
    if (weeks > 0) dateParts.push(`${weeks}週間`);
    if (days > 0) dateParts.push(`${days}日`);

    if (dateParts.length > 0) {
      return `${dateParts.join('')}${timePart}経過`;
    }
    return `${timePart}経過`;
  }

  function stopElapsedTimer() {
    if (elapsedTimerId) {
      clearInterval(elapsedTimerId);
      elapsedTimerId = null;
    }
  }

  function startElapsedTimer(lastIso) {
    stopElapsedTimer();
    const lastTime = new Date(lastIso).getTime();

    function tick() {
      const diffSec = Math.floor((Date.now() - lastTime) / 1000);
      elapsedTimerValue.textContent = formatElapsedLive(diffSec);
    }
    tick();
    elapsedTimerId = setInterval(tick, 1000);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day}  ${h}:${min}`;
  }

  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear()
      && d1.getMonth() === d2.getMonth()
      && d1.getDate() === d2.getDate();
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), 2000);
  }

  // ---- Navigation ----
  function showScreen(screen) {
    screenList.classList.remove('active');
    screenDetail.classList.remove('active');
    screen.classList.add('active');
    if (screen !== screenDetail) stopElapsedTimer();
    window.scrollTo(0, 0);
  }

  // ---- Render List ----
  function renderList() {
    itemListEl.innerHTML = '';
    if (state.items.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    state.items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.style.animationDelay = `${idx * 0.05}s`;

      const elapsed = elapsedDaysText(item.records);
      const isToday = elapsed === null;
      const elapsedHtml = isToday
        ? '<span class="elapsed-today">今日</span>'
        : elapsed;
      const annualCost = calcAnnualCost(item);

      card.innerHTML = `
        <div class="item-icon" style="background:${getColorForIndex(idx)}">
          ${item.name.charAt(0)}
        </div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-elapsed">${item.records.length > 0 ? elapsedHtml : '記録なし'}</div>
          ${item.defaultPrice > 0 ? `<div class="item-annual-cost ${annualCost >= 100000 ? 'cost-warning' : ''}">年換算: 約${formatYen(annualCost)}/年</div>` : ''}
        </div>
        <button class="btn-record" data-id="${item.id}" aria-label="${item.name}を記録">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      `;

      // Click card → detail
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-record')) return;
        openDetail(item.id);
      });

      // Click + → record immediately with default price
      const btnRec = card.querySelector('.btn-record');
      btnRec.addEventListener('click', (e) => {
        e.stopPropagation();
        recordEvent(item.id, item.defaultPrice || 0);
        showToast('✅ 記録しました！');
        renderList();
      });

      itemListEl.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Detail Screen ----
  function openDetail(id) {
    currentItemId = id;
    renderDetail();
    showScreen(screenDetail);
  }

  function renderDetail() {
    const item = state.items.find((i) => i.id === currentItemId);
    if (!item) return;

    detailTitle.textContent = item.name;

    // Compute average interval for frequency cards
    if (item.records.length >= 2) {
      const dates = item.records.map(r => new Date(getRecordDate(r)).getTime()).sort((a, b) => a - b);
      const totalSpan = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
      const avgDays = totalSpan / (dates.length - 1);

      // Frequencies
      if (avgDays < 1) {
        freqDaily.textContent = `${Math.round(1 / avgDays)}回`;
      } else {
        freqDaily.textContent = avgDays <= 1.5 ? '1回' : `${avgDays.toFixed(1)}日に1回`;
      }
      const perMonth = 30 / avgDays;
      freqMonthly.textContent = perMonth >= 1 ? `${perMonth.toFixed(1)}回` : `${Math.round(avgDays / 30)}ヶ月に1回`;
      const perYear = 365 / avgDays;
      freqYearly.textContent = perYear >= 1 ? `${perYear.toFixed(1)}回` : `${(avgDays / 365).toFixed(1)}年に1回`;
    } else {
      freqDaily.textContent = '—';
      freqMonthly.textContent = '—';
      freqYearly.textContent = '—';
    }

    // Live timer
    if (item.records.length > 0) {
      const lastRec = item.records[item.records.length - 1];
      const lastIso = getRecordDate(lastRec);
      elapsedTimerEl.classList.remove('hidden');
      startElapsedTimer(lastIso);
    } else {
      elapsedTimerEl.classList.add('hidden');
      stopElapsedTimer();
    }

    // Subtle price display
    if (item.defaultPrice > 0) {
      detailPriceText.textContent = `@${formatYen(item.defaultPrice)}`;
      detailPriceLine.style.display = '';
    } else {
      detailPriceLine.style.display = 'none';
    }

    // Period counts
    const now = new Date();
    let today = 0, month = 0, year = 0;
    item.records.forEach((r) => {
      const d = new Date(getRecordDate(r));
      if (isSameDay(d, now)) today++;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month++;
      if (d.getFullYear() === now.getFullYear()) year++;
    });
    countToday.textContent = today;
    countMonth.textContent = month;
    countYear.textContent = year;
    countAll.textContent = item.records.length;

    // Money dashboard
    const totalCost = item.records.reduce((s, r) => s + getRecordAmount(r), 0);
    detailTotalCost.textContent = formatYen(totalCost);
    const annual = calcAnnualCost(item);
    detailAnnualCost.textContent = formatYen(annual);
    if (annual >= 100000) {
      detailAnnualCost.classList.add('cost-warning');
    } else {
      detailAnnualCost.classList.remove('cost-warning');
    }

    // History
    historyList.innerHTML = '';
    if (item.records.length === 0) {
      historyEmpty.classList.remove('hidden');
      historyList.classList.add('hidden');
      return;
    }
    historyEmpty.classList.add('hidden');
    historyList.classList.remove('hidden');

    const sorted = [...item.records].reverse();
    sorted.forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.style.animationDelay = `${idx * 0.04}s`;

      // Elapsed since previous record
      let badge = '';
      const chronoIdx = item.records.length - 1 - idx;
      if (chronoIdx > 0) {
        const prev = new Date(getRecordDate(item.records[chronoIdx - 1]));
        const cur = new Date(getRecordDate(r));
        const diff = Math.floor((cur - prev) / (1000 * 60 * 60 * 24));
        badge = diff === 0 ? '同日' : `${diff}日ぶり`;
      } else {
        badge = '初回';
      }

      const amt = getRecordAmount(r);
      div.innerHTML = `
        <span class="history-date">${formatDate(getRecordDate(r))}</span>
        ${amt > 0 ? `<span class="history-amount">${formatYen(amt)}</span>` : ''}
        <span class="history-elapsed">${badge}</span>
        <button class="btn-history-delete" data-chrono-idx="${chronoIdx}" aria-label="この記録を削除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      // Delete single record
      div.querySelector('.btn-history-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const ci = parseInt(e.currentTarget.dataset.chronoIdx, 10);
        deleteRecord(currentItemId, ci);
      });

      // Tap row to edit record amount
      div.addEventListener('click', (e) => {
        if (e.target.closest('.btn-history-delete')) return;
        openHistoryEdit(chronoIdx);
      });

      historyList.appendChild(div);
    });
  }

  // ---- Actions ----
  function addItem(name, price) {
    const item = {
      id: uuid(),
      name: name.trim(),
      defaultPrice: price || 0,
      records: [],
    };
    state.items.push(item);
    save();
    renderList();
  }

  function deleteItem(id) {
    state.items = state.items.filter((i) => i.id !== id);
    save();
    showScreen(screenList);
    renderList();
    showToast('🗑️ 削除しました');
  }

  function recordEvent(id, amount) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    item.records.push({ date: new Date().toISOString(), amount: amount || 0 });
    save();
  }

  function openRecordModal(itemId) {
    pendingRecordItemId = itemId;
    const item = state.items.find(i => i.id === itemId);
    inputRecordAmount.value = item ? item.defaultPrice : 0;
    modalRecordOverlay.classList.remove('hidden');
    setTimeout(() => inputRecordAmount.select(), 100);
  }

  function deleteRecord(id, chronoIdx) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    item.records.splice(chronoIdx, 1);
    save();
    renderDetail();
    showToast('🗑️ 記録を削除しました');
  }

  // ---- Event Listeners ----

  // Add item modal
  btnAddItem.addEventListener('click', () => {
    inputItemName.value = '';
    inputItemPrice.value = '';
    modalOverlay.classList.remove('hidden');
    setTimeout(() => inputItemName.focus(), 100);
  });

  btnModalCancel.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
  });

  btnModalAdd.addEventListener('click', () => {
    const name = inputItemName.value.trim();
    if (!name) {
      inputItemName.focus();
      return;
    }
    const price = parseInt(inputItemPrice.value, 10) || 0;
    addItem(name, price);
    modalOverlay.classList.add('hidden');
    showToast('🎉 追加しました！');
  });

  inputItemName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnModalAdd.click();
  });

  // Close modal on overlay click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
  });

  // Back button
  btnBack.addEventListener('click', () => {
    showScreen(screenList);
    renderList();
  });

  // Record from detail — immediate, no modal
  btnRecordDetail.addEventListener('click', () => {
    const item = state.items.find(i => i.id === currentItemId);
    recordEvent(currentItemId, item ? item.defaultPrice || 0 : 0);
    renderDetail();
    showToast('✅ 記録しました！');
  });

  // Record modal
  btnRecordCancel.addEventListener('click', () => {
    modalRecordOverlay.classList.add('hidden');
    pendingRecordItemId = null;
  });

  btnRecordConfirm.addEventListener('click', () => {
    const amount = parseInt(inputRecordAmount.value, 10) || 0;
    recordEvent(pendingRecordItemId, amount);
    modalRecordOverlay.classList.add('hidden');
    showToast('✅ 記録しました！');
    // Re-render appropriate screen
    if (screenDetail.classList.contains('active') && currentItemId === pendingRecordItemId) {
      renderDetail();
    } else {
      renderList();
    }
    pendingRecordItemId = null;
  });

  inputRecordAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnRecordConfirm.click();
  });

  modalRecordOverlay.addEventListener('click', (e) => {
    if (e.target === modalRecordOverlay) {
      modalRecordOverlay.classList.add('hidden');
      pendingRecordItemId = null;
    }
  });

  // Delete item
  btnDeleteItem.addEventListener('click', () => {
    modalDeleteOverlay.classList.remove('hidden');
  });

  btnDeleteCancel.addEventListener('click', () => {
    modalDeleteOverlay.classList.add('hidden');
  });

  btnDeleteConfirm.addEventListener('click', () => {
    modalDeleteOverlay.classList.add('hidden');
    deleteItem(currentItemId);
  });

  modalDeleteOverlay.addEventListener('click', (e) => {
    if (e.target === modalDeleteOverlay) modalDeleteOverlay.classList.add('hidden');
  });

  // ---- Price Edit ----
  btnEditPrice.addEventListener('click', () => {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item) return;
    inputEditPrice.value = item.defaultPrice || 0;
    modalPriceEditOverlay.classList.remove('hidden');
    setTimeout(() => inputEditPrice.select(), 100);
  });

  btnPriceEditCancel.addEventListener('click', () => {
    modalPriceEditOverlay.classList.add('hidden');
  });

  btnPriceEditSave.addEventListener('click', () => {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item) return;
    item.defaultPrice = parseInt(inputEditPrice.value, 10) || 0;
    save();
    modalPriceEditOverlay.classList.add('hidden');
    renderDetail();
    showToast('✏️ 単価を更新しました');
  });

  inputEditPrice.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnPriceEditSave.click();
  });

  modalPriceEditOverlay.addEventListener('click', (e) => {
    if (e.target === modalPriceEditOverlay) modalPriceEditOverlay.classList.add('hidden');
  });

  // ---- History Record Edit ----
  function openHistoryEdit(chronoIdx) {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item || !item.records[chronoIdx]) return;
    editingHistoryChronoIdx = chronoIdx;
    const rec = item.records[chronoIdx];
    historyEditDate.textContent = formatDate(getRecordDate(rec));
    inputHistoryAmount.value = getRecordAmount(rec);
    modalHistoryEditOverlay.classList.remove('hidden');
    setTimeout(() => inputHistoryAmount.select(), 100);
  }

  btnHistoryEditCancel.addEventListener('click', () => {
    modalHistoryEditOverlay.classList.add('hidden');
    editingHistoryChronoIdx = null;
  });

  btnHistoryEditSave.addEventListener('click', () => {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item || editingHistoryChronoIdx === null) return;
    const rec = item.records[editingHistoryChronoIdx];
    if (typeof rec === 'object') {
      rec.amount = parseInt(inputHistoryAmount.value, 10) || 0;
    } else {
      // Migrate old string format on-the-fly
      item.records[editingHistoryChronoIdx] = {
        date: rec,
        amount: parseInt(inputHistoryAmount.value, 10) || 0,
      };
    }
    save();
    modalHistoryEditOverlay.classList.add('hidden');
    editingHistoryChronoIdx = null;
    renderDetail();
    showToast('✏️ 金額を更新しました');
  });

  inputHistoryAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnHistoryEditSave.click();
  });

  modalHistoryEditOverlay.addEventListener('click', (e) => {
    if (e.target === modalHistoryEditOverlay) modalHistoryEditOverlay.classList.add('hidden');
  });

  // ---- Share Feature ----
  const btnShare = $('#btn-share');
  const shareCard = $('#share-card');
  const shareCardBg = $('#share-card-bg');
  const shareCardName = $('#share-card-name');
  const shareCardAvg = $('#share-card-avg');
  const shareCardCompare = $('#share-card-compare');
  const shareCardStamp = $('#share-card-stamp');
  const shareCardBars = $('#share-card-bars');
  const shareCardQrImg = $('#share-card-qr-img');
  const sharePreview = $('#share-preview');
  const modalShareOverlay = $('#modal-share-overlay');
  const btnShareSave = $('#btn-share-save');
  const btnShareX = $('#btn-share-x');
  const btnShareClose = $('#btn-share-close');
  let shareCanvasDataUrl = null;

  // Compute intervals (in days) between consecutive records
  function getIntervals(records) {
    if (records.length < 2) return [];
    const dates = records.map(r => new Date(getRecordDate(r)).getTime()).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(Math.max(1, Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))));
    }
    return intervals;
  }

  function getStabilityTitle(intervals) {
    if (intervals.length < 3) return { title: '📊 記録収集中', emoji: '📊' };
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stddev = Math.sqrt(intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length);
    const cv = avg > 0 ? stddev / avg : 0; // coefficient of variation
    if (cv < 0.15) return { title: '🎯 超安定', emoji: '🎯' };
    if (cv < 0.30) return { title: '✨ 安定', emoji: '✨' };
    if (cv < 0.50) return { title: '🌊 マイペース', emoji: '🌊' };
    if (cv < 0.80) return { title: '🎲 気まぐれ', emoji: '🎲' };
    return { title: '�️ カオス', emoji: '�️' };
  }

  function getCompareComment(ratio) {
    // ratio = current / average (e.g. 1.5 = 50% over)
    if (ratio < 0.5) return 'ハイペース！🚀';
    if (ratio < 0.8) return '早め ⚡';
    if (ratio < 1.2) return 'いいリズム 👍';
    if (ratio < 1.5) return 'ちょいサボり 😅';
    if (ratio < 2.0) return 'サボり気味？🫠';
    return '完全に忘れてた…💀';
  }

  function getHeatmapGradient(avgDays) {
    const stops = [
      { d: 0, c1: '#4facfe', c2: '#00f2fe' },
      { d: 3, c1: '#43e97b', c2: '#38f9d7' },
      { d: 7, c1: '#a8eb12', c2: '#38ef7d' },
      { d: 14, c1: '#fbc2eb', c2: '#a6c1ee' },
      { d: 30, c1: '#f6d365', c2: '#fda085' },
      { d: 60, c1: '#ff9a9e', c2: '#fecfef' },
      { d: 90, c1: '#f857a6', c2: '#ff5858' },
      { d: 180, c1: '#eb3349', c2: '#f45c43' },
      { d: 365, c1: '#870000', c2: '#190a05' },
    ];
    let lower = stops[0], upper = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (avgDays >= stops[i].d && avgDays < stops[i + 1].d) {
        lower = stops[i]; upper = stops[i + 1]; break;
      }
    }
    if (avgDays >= stops[stops.length - 1].d) {
      return `linear-gradient(135deg, ${upper.c1}, ${upper.c2})`;
    }
    const range = upper.d - lower.d || 1;
    const t = Math.min((avgDays - lower.d) / range, 1);
    function lerp(a, b, t) {
      const p = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const ca = p(a), cb = p(b);
      return '#' + [0, 1, 2].map(i => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0')).join('');
    }
    return `linear-gradient(135deg, ${lerp(lower.c1, upper.c1, t)}, ${lerp(lower.c2, upper.c2, t)})`;
  }

  async function generateShareCard() {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item) return;

    const intervals = getIntervals(item.records);
    const hasEnoughData = intervals.length >= 1;
    const avgInterval = hasEnoughData
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : 0;

    // Current elapsed days
    const lastRec = item.records.length > 0 ? item.records[item.records.length - 1] : null;
    const currentElapsed = lastRec
      ? Math.floor((Date.now() - new Date(getRecordDate(lastRec)).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // --- Populate card ---
    shareCardName.textContent = `「${item.name}」のアレカラ周期`;

    // Main: Average interval
    if (hasEnoughData) {
      shareCardAvg.textContent = `${avgInterval}日`;
    } else {
      shareCardAvg.textContent = '...';
    }

    // Sub: Compare current vs average
    if (hasEnoughData && lastRec) {
      const ratio = avgInterval > 0 ? currentElapsed / avgInterval : 0;
      const pctDiff = Math.round((ratio - 1) * 100);
      const sign = pctDiff >= 0 ? '+' : '';
      const comment = getCompareComment(ratio);
      shareCardCompare.innerHTML = `今回は ${currentElapsed}日ぶり（平均比 ${sign}${pctDiff}%）<span class="share-compare-badge">${comment}</span>`;
    } else {
      shareCardCompare.innerHTML = '記録収集中…もう少しデータが必要です 📝';
    }

    // Stability stamp
    const stability = getStabilityTitle(intervals);
    shareCardStamp.textContent = stability.title;

    // Rhythm bar chart (last 5 intervals)
    shareCardBars.innerHTML = '';
    const recentIntervals = intervals.slice(-5);
    if (recentIntervals.length > 0) {
      const maxVal = Math.max(...recentIntervals, 1);
      recentIntervals.forEach((iv) => {
        const pct = Math.max(10, (iv / maxVal) * 100);
        const bar = document.createElement('div');
        bar.className = 'share-bar';
        bar.style.height = `${pct}%`;
        bar.title = `${iv}日`;
        // Add label below bar
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;min-width:8px;max-width:40px;';
        wrapper.appendChild(bar);
        const lbl = document.createElement('div');
        lbl.className = 'share-bar-label';
        lbl.textContent = `${iv}d`;
        wrapper.appendChild(lbl);
        shareCardBars.appendChild(wrapper);
      });
    } else {
      shareCardBars.innerHTML = '<div style="font-size:12px;opacity:0.5;">データなし</div>';
    }

    // Background heatmap based on average interval
    shareCardBg.style.background = getHeatmapGradient(avgInterval);

    // QR code
    const appUrl = window.location.href;
    shareCardQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(appUrl)}`;
    await new Promise(resolve => {
      shareCardQrImg.onload = resolve;
      shareCardQrImg.onerror = resolve;
      setTimeout(resolve, 2000);
    });

    // Render with html2canvas
    showToast('🎨 画像を生成中…');
    const canvas = await html2canvas(shareCard, {
      width: 600,
      height: 420,
      scale: 2,
      useCORS: true,
      backgroundColor: null,
    });

    shareCanvasDataUrl = canvas.toDataURL('image/png');
    sharePreview.innerHTML = `<img src="${shareCanvasDataUrl}" alt="シェア画像" />`;
    modalShareOverlay.classList.remove('hidden');
  }

  btnShare.addEventListener('click', () => {
    generateShareCard();
  });

  btnShareSave.addEventListener('click', () => {
    if (!shareCanvasDataUrl) return;
    const link = document.createElement('a');
    link.download = 'arekara-share.png';
    link.href = shareCanvasDataUrl;
    link.click();
    showToast('💾 画像を保存しました！');
  });

  btnShareX.addEventListener('click', () => {
    const item = state.items.find(i => i.id === currentItemId);
    if (!item) return;
    const intervals = getIntervals(item.records);
    const avg = intervals.length > 0
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : 0;
    const stability = getStabilityTitle(intervals);
    const text = avg > 0
      ? `「${item.name}」のアレカラ周期は平均${avg}日おき！${stability.emoji}\n#Arekara`
      : `「${item.name}」の記録を始めました！\n#Arekara`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  });

  btnShareClose.addEventListener('click', () => {
    modalShareOverlay.classList.add('hidden');
  });

  modalShareOverlay.addEventListener('click', (e) => {
    if (e.target === modalShareOverlay) modalShareOverlay.classList.add('hidden');
  });

  // ---- Init ----
  load();
  migrateData();
  renderList();

})();
